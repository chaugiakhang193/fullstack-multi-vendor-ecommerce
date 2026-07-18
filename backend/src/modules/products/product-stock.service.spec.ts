import { BadRequestException } from '@nestjs/common';
import { ProductStockService } from './product-stock.service';
import { Product } from '@/modules/products/entities/product.entity';
import { ProductVariant } from '@/modules/products/entities/product-variant.entity';

// EntityManager giả: find() trả theo entity, save() no-op. lockAndDeduct mutate in-place.
function makeManager(
  products: Partial<Product>[],
  variants: Partial<ProductVariant>[],
) {
  return {
    find: jest.fn((entity: unknown) => {
      if (entity === Product) return Promise.resolve(products);
      if (entity === ProductVariant) return Promise.resolve(variants);
      return Promise.resolve([]);
    }),
    save: jest.fn().mockResolvedValue(undefined),
  } as any;
}

describe('ProductStockService.lockAndDeductStockForCheckout', () => {
  const svc = new ProductStockService();

  it('đủ kho (không variant) → trừ product.stock_quantity', async () => {
    const product = { id: 'p1', name: 'A', stock_quantity: 5 } as Product;
    const manager = makeManager([product], []);

    await svc.lockAndDeductStockForCheckout(
      [{ product_id: 'p1', variant_id: null, quantity: 3 }],
      manager,
    );

    expect(product.stock_quantity).toBe(2);
    expect(manager.save).toHaveBeenCalledWith(Product, [product]);
  });

  it('thiếu kho → BadRequestException kèm danh sách insufficient', async () => {
    const product = { id: 'p1', name: 'A', stock_quantity: 1 } as Product;
    const manager = makeManager([product], []);

    await expect(
      svc.lockAndDeductStockForCheckout(
        [{ product_id: 'p1', variant_id: null, quantity: 3 }],
        manager,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('item có variant → trừ cả variant lẫn product cha (đồng bộ)', async () => {
    const product = { id: 'p1', name: 'A', stock_quantity: 10 } as Product;
    const variant = {
      id: 'v1',
      name: 'Đỏ',
      stock_quantity: 4,
    } as ProductVariant;
    const manager = makeManager([product], [variant]);

    await svc.lockAndDeductStockForCheckout(
      [{ product_id: 'p1', variant_id: 'v1', quantity: 2 }],
      manager,
    );

    expect(variant.stock_quantity).toBe(2);
    expect(product.stock_quantity).toBe(8);
  });
});
