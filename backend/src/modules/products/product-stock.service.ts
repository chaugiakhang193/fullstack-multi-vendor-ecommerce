import { Injectable, BadRequestException } from '@nestjs/common';
import { In, EntityManager } from 'typeorm';

import { Product } from '@/modules/products/entities/product.entity';
import { ProductVariant } from '@/modules/products/entities/product-variant.entity';

@Injectable()
export class ProductStockService {
  /**
   * Khoá và trừ kho atomically cho luồng Checkout, đồng bộ cha-con.
   *
   * Để triệt deadlock giữa 2 bảng, mọi transaction phải đụng vào Product TRƯỚC
   * rồi mới đến ProductVariant. Bên trong từng bảng, dedupe + sort ID ASC.
   *
   * TOCTOU: KHÔNG tin tồn kho từ snapshot giỏ hàng. Sau khi khoá pessimistic_write
   * sẽ đọc lại stock_quantity từ row đã khoá rồi mới kiểm tra điều kiện đủ kho.
   * Nếu thiếu kho ở bất kỳ item nào → ném BadRequest kèm danh sách chi tiết để
   * OrdersService gộp vào lỗi all-or-nothing.
   *
   * Đồng bộ cha-con: với item có variant trừ cả variant.stock_quantity và
   * product.stock_quantity (cộng dồn theo product_id). Bảng có @Check(stock>=0)
   * làm chốt chặn cuối cùng ở DB.
   *
   * @returns Map theo key `${product_id}|${variant_id ?? 'null'}` → entity đã khoá
   *          để OrdersService snapshot vào OrderItem.
   */
  async lockAndDeductStockForCheckout(
    items: Array<{
      product_id: string;
      variant_id: string | null;
      quantity: number;
    }>,
    manager: EntityManager,
  ): Promise<
    Map<string, { product: Product; variant: ProductVariant | null }>
  > {
    // Tổng số lượng yêu cầu theo từng product_id (parent) và variant_id (child)
    const totalQtyByProductId = new Map<string, number>();
    const totalQtyByVariantId = new Map<string, number>();
    for (const item of items) {
      const prevProductQty = totalQtyByProductId.get(item.product_id) ?? 0;
      totalQtyByProductId.set(item.product_id, prevProductQty + item.quantity);
      if (item.variant_id) {
        const prevVariantQty = totalQtyByVariantId.get(item.variant_id) ?? 0;
        totalQtyByVariantId.set(item.variant_id, prevVariantQty + item.quantity);
      }
    }

    // Sort ASC trong từng tập + cố định thứ tự bảng (Product → Variant) chống deadlock
    const sortedProductIds = [...totalQtyByProductId.keys()].sort();
    const sortedVariantIds = [...totalQtyByVariantId.keys()].sort();

    // Khoá row cha Product trước
    const lockedProducts =
      sortedProductIds.length > 0
        ? await manager.find(Product, {
            where: { id: In(sortedProductIds) },
            lock: { mode: 'pessimistic_write' },
            order: { id: 'ASC' },
          })
        : [];

    // Sau đó mới khoá variant con
    const lockedVariants =
      sortedVariantIds.length > 0
        ? await manager.find(ProductVariant, {
            where: { id: In(sortedVariantIds) },
            lock: { mode: 'pessimistic_write' },
            order: { id: 'ASC' },
          })
        : [];

    const productById = new Map<string, Product>();
    for (const product of lockedProducts) {
      productById.set(product.id, product);
    }
    const variantById = new Map<string, ProductVariant>();
    for (const variant of lockedVariants) {
      variantById.set(variant.id, variant);
    }

    // Kiểm tra tồn tại entity (có thể đã bị xoá giữa lúc đọc giỏ và lúc khoá)
    type Insufficient = {
      product_id: string;
      product_name: string | null;
      variant_id: string | null;
      variant_name: string | null;
      requested: number;
      available: number;
    };
    const insufficient: Insufficient[] = [];

    for (const item of items) {
      const product = productById.get(item.product_id);
      if (!product) {
        insufficient.push({
          product_id: item.product_id,
          product_name: null,
          variant_id: item.variant_id,
          variant_name: null,
          requested: item.quantity,
          available: 0,
        });
        continue;
      }

      if (item.variant_id) {
        const variant = variantById.get(item.variant_id);
        if (!variant) {
          insufficient.push({
            product_id: item.product_id,
            product_name: product.name,
            variant_id: item.variant_id,
            variant_name: null,
            requested: item.quantity,
            available: 0,
          });
          continue;
        }
        const requiredVariantQty =
          totalQtyByVariantId.get(item.variant_id) ?? 0;
        const isVariantInsufficient =
          variant.stock_quantity < requiredVariantQty;
        if (isVariantInsufficient) {
          insufficient.push({
            product_id: item.product_id,
            product_name: product.name,
            variant_id: item.variant_id,
            variant_name: variant.name,
            requested: requiredVariantQty,
            available: variant.stock_quantity,
          });
        }
      } else {
        const requiredProductQty =
          totalQtyByProductId.get(item.product_id) ?? 0;
        const isProductInsufficient =
          product.stock_quantity < requiredProductQty;
        if (isProductInsufficient) {
          insufficient.push({
            product_id: item.product_id,
            product_name: product.name,
            variant_id: null,
            variant_name: null,
            requested: requiredProductQty,
            available: product.stock_quantity,
          });
        }
      }
    }

    const hasInsufficient = insufficient.length > 0;
    if (hasInsufficient) {
      const insufficientMsg = 'Một số sản phẩm không đủ tồn kho để đặt hàng';
      throw new BadRequestException({
        message: insufficientMsg,
        insufficient,
      });
    }

    // Trừ kho variant con
    for (const [variantId, qty] of totalQtyByVariantId) {
      const variant = variantById.get(variantId)!;
      variant.stock_quantity = variant.stock_quantity - qty;
    }

    // Trừ kho product cha (cộng dồn theo product_id, gồm cả item có variant)
    for (const [productId, qty] of totalQtyByProductId) {
      const product = productById.get(productId)!;
      product.stock_quantity = product.stock_quantity - qty;
    }

    // Lưu lại tất cả entity đã khoá. Bảng có @Check(stock>=0) là chốt chặn cuối.
    const hasLockedVariants = lockedVariants.length > 0;
    if (hasLockedVariants) {
      await manager.save(ProductVariant, lockedVariants);
    }
    const hasLockedProducts = lockedProducts.length > 0;
    if (hasLockedProducts) {
      await manager.save(Product, lockedProducts);
    }

    // Bản đồ tra cứu cho snapshot OrderItem ở OrdersService
    const resolved = new Map<
      string,
      { product: Product; variant: ProductVariant | null }
    >();
    for (const item of items) {
      const product = productById.get(item.product_id)!;
      const variant = item.variant_id
        ? (variantById.get(item.variant_id) ?? null)
        : null;
      const variantKey = item.variant_id ?? 'null';
      const key = `${item.product_id}|${variantKey}`;
      resolved.set(key, { product, variant });
    }
    return resolved;
  }
}
