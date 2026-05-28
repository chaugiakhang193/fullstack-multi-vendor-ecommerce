import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, DataSource } from 'typeorm';
import { CartItem } from '@/modules/carts/entities/cart-item.entity';
import { Product } from '@/modules/products/entities/product.entity';
import { ProductVariant } from '@/modules/products/entities/product-variant.entity';
import { ProductsService } from '@/modules/products/products.service';
import { AddCartItemDto } from '@/modules/carts/dto/add-cart-item.dto';
import { UpdateCartItemDto } from '@/modules/carts/dto/update-cart-item.dto';
import { MergeCartDto } from '@/modules/carts/dto/merge-cart.dto';
import {
  CartResponseDto,
  CartItemResponseDto,
  CartShopGroupDto,
} from '@/modules/carts/dto/cart-response.dto';
import {
  ProductStatus,
  AccountStatus,
  CartItemUnavailableReason,
} from '@/common/enums';
import { CART_LIMITS } from '@/common/constants/cart.constant';

@Injectable()
export class CartsService {
  constructor(
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    private readonly productsService: ProductsService,
    private readonly dataSource: DataSource,
  ) {}

  async addItem(
    userId: string,
    addCartItemDto: AddCartItemDto,
  ): Promise<CartResponseDto> {
    const productId = addCartItemDto.product_id;
    const product =
      await this.productsService.getProductForCartValidation(productId);

    if (product.status === ProductStatus.DELETED) {
      const deletedMessage = 'Sản phẩm không tồn tại hoặc đã bị xóa';
      throw new BadRequestException(deletedMessage);
    }

    if (product.is_hidden) {
      const hiddenMessage = 'Sản phẩm đã bị ẩn hoặc ngừng bán';
      throw new BadRequestException(hiddenMessage);
    }

    if (product.shop?.status !== AccountStatus.ACTIVE) {
      const shopInactiveMessage = 'Cửa hàng hiện không hoạt động';
      throw new BadRequestException(shopInactiveMessage);
    }

    if (product.shop?.seller?.id === userId) {
      const selfPurchaseMessage = 'Bạn không thể mua sản phẩm của shop mình';
      throw new BadRequestException(selfPurchaseMessage);
    }

    let availableStock = 0;
    const variantId = addCartItemDto.variant_id;

    if (product.has_variants) {
      if (!variantId) {
        const variantRequiredMessage =
          'Sản phẩm này có biến thể, vui lòng chọn một biến thể';
        throw new BadRequestException(variantRequiredMessage);
      }

      const variant = product.variants?.find((v) => v.id === variantId);

      if (!variant) {
        const variantNotFoundMessage = 'Biến thể không thuộc sản phẩm này';
        throw new NotFoundException(variantNotFoundMessage);
      }

      availableStock = variant.stock_quantity ?? 0;
    } else {
      if (variantId) {
        const noVariantMessage = 'Sản phẩm này không có biến thể';
        throw new BadRequestException(noVariantMessage);
      }

      availableStock = product.stock_quantity ?? 0;
    }

    if (availableStock <= 0) {
      const outOfStockMessage = 'Sản phẩm hiện đã hết hàng';
      throw new BadRequestException(outOfStockMessage);
    }

    const findOptions = {
      where: {
        user: { id: userId },
        product: { id: productId },
        variant: variantId ? { id: variantId } : IsNull(),
      },
    };
    const existingItem = await this.cartItemRepository.findOne(findOptions);

    const quantityToAdd =
      addCartItemDto.quantity ?? CART_LIMITS.MIN_QUANTITY_PER_ITEM;

    if (existingItem) {
      const newQty = existingItem.quantity + quantityToAdd;
      if (newQty > CART_LIMITS.MAX_QUANTITY_PER_ITEM) {
        const maxLimitMessage = `Tổng số lượng tối đa cho mỗi sản phẩm trong giỏ hàng là ${CART_LIMITS.MAX_QUANTITY_PER_ITEM}`;
        throw new BadRequestException(maxLimitMessage);
      }
      if (newQty > availableStock) {
        const stockExceededMessage = `Số lượng vượt quá tồn kho còn lại (${availableStock})`;
        throw new BadRequestException(stockExceededMessage);
      }
      existingItem.quantity = newQty;
      await this.cartItemRepository.save(existingItem);
    } else {
      if (quantityToAdd > availableStock) {
        const stockExceededMessage = `Số lượng vượt quá tồn kho còn lại (${availableStock})`;
        throw new BadRequestException(stockExceededMessage);
      }

      const countOptions = {
        where: { user: { id: userId } },
      };
      const distinctCount = await this.cartItemRepository.count(countOptions);

      if (distinctCount >= CART_LIMITS.MAX_DISTINCT_ITEMS) {
        const maxDistinctMessage = `Giỏ hàng của bạn đã đạt giới hạn tối đa ${CART_LIMITS.MAX_DISTINCT_ITEMS} sản phẩm khác nhau. Vui lòng thanh toán hoặc xóa bớt để thêm mới.`;
        throw new BadRequestException(maxDistinctMessage);
      }

      const newItemData = {
        user: { id: userId } as any,
        product: { id: productId } as any,
        variant: variantId ? ({ id: variantId } as any) : null,
        quantity: quantityToAdd,
      };
      const newItem = this.cartItemRepository.create(newItemData);

      await this.cartItemRepository.save(newItem);
    }

    return this.getCart(userId);
  }

  async getCart(userId: string): Promise<CartResponseDto> {
    const cartItems = await this.cartItemRepository.find({
      where: { user: { id: userId } },
      relations: ['product', 'product.shop', 'product.shop.seller', 'variant'],
      order: { added_at: 'DESC' },
    });

    const groupsMap = new Map<string, CartShopGroupDto>();

    for (const item of cartItems) {
      if (!item.product) continue;

      const shop = item.product.shop;
      const shopId = shop?.id || 'unknown';

      const price = Number(item.product.price);
      const addPrice = Number(item.variant?.additional_price ?? 0);
      const unit_price = Math.round((price + addPrice) * 100) / 100;
      const subtotal = Math.round(unit_price * item.quantity * 100) / 100;

      const available_stock = item.variant
        ? (item.variant.stock_quantity ?? 0)
        : (item.product.stock_quantity ?? 0);

      let is_available = true;
      let reason: CartItemUnavailableReason | undefined = undefined;

      if (item.product.status === ProductStatus.DELETED) {
        is_available = false;
        reason = CartItemUnavailableReason.PRODUCT_DELETED;
      } else if (item.product.is_hidden) {
        is_available = false;
        reason = CartItemUnavailableReason.PRODUCT_HIDDEN;
      } else if (shop?.status !== AccountStatus.ACTIVE) {
        is_available = false;
        reason = CartItemUnavailableReason.SHOP_INACTIVE;
      } else if (available_stock <= 0) {
        is_available = false;
        reason = CartItemUnavailableReason.OUT_OF_STOCK;
      } else if (available_stock < item.quantity) {
        is_available = false;
        reason = CartItemUnavailableReason.INSUFFICIENT_STOCK;
      }

      const responseItem: CartItemResponseDto = {
        id: item.id,
        product: {
          id: item.product.id,
          name: item.product.name,
          slug: item.product.slug,
          price: Number(item.product.price),
          thumbnail_url: item.product.thumbnail_url,
          is_hidden: item.product.is_hidden,
          status: item.product.status,
        },
        variant: item.variant
          ? {
              id: item.variant.id,
              name: item.variant.name,
              additional_price: Number(item.variant.additional_price),
            }
          : null,
        quantity: item.quantity,
        unit_price,
        subtotal,
        added_at: item.added_at,
        available_stock,
        is_available,
        reason,
      };

      if (!groupsMap.has(shopId)) {
        groupsMap.set(shopId, {
          shop: {
            id: shop?.id || '',
            name: shop?.name || 'Unknown Shop',
            logo_url: shop?.logo_url || null,
          },
          items: [],
          shop_subtotal: 0,
        });
      }

      const group = groupsMap.get(shopId)!;
      group.items.push(responseItem);
      if (is_available) {
        group.shop_subtotal += subtotal;
      }
    }

    const items_by_shop = Array.from(groupsMap.values());
    let total_quantity = 0;
    let total_amount = 0;

    for (const group of items_by_shop) {
      group.shop_subtotal = Math.round(group.shop_subtotal * 100) / 100;
      for (const item of group.items) {
        if (item.is_available) {
          total_quantity += item.quantity;
          total_amount += item.subtotal;
        }
      }
    }

    total_amount = Math.round(total_amount * 100) / 100;

    return {
      items_by_shop,
      total_items: cartItems.length,
      total_quantity,
      total_amount,
    };
  }

  async updateItemQuantity(
    userId: string,
    cartItemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    const findOptions = {
      where: { id: cartItemId, user: { id: userId } },
      relations: ['product', 'product.shop', 'variant'],
    };
    const item = await this.cartItemRepository.findOne(findOptions);

    if (!item) {
      const itemNotFoundMessage = 'Không tìm thấy sản phẩm trong giỏ hàng';
      throw new NotFoundException(itemNotFoundMessage);
    }

    if (item.product.status === ProductStatus.DELETED) {
      const deletedMessage = 'Sản phẩm không tồn tại hoặc đã bị xóa';
      throw new BadRequestException(deletedMessage);
    }

    if (item.product.is_hidden) {
      const hiddenMessage = 'Sản phẩm đã bị ẩn hoặc ngừng bán';
      throw new BadRequestException(hiddenMessage);
    }

    if (item.product.shop?.status !== AccountStatus.ACTIVE) {
      const shopInactiveMessage = 'Cửa hàng hiện không hoạt động';
      throw new BadRequestException(shopInactiveMessage);
    }

    const availableStock = item.variant
      ? (item.variant.stock_quantity ?? 0)
      : (item.product.stock_quantity ?? 0);

    const updateQuantity = dto.quantity;
    if (updateQuantity > availableStock) {
      const stockExceededMessage = `Số lượng vượt quá tồn kho còn lại (${availableStock})`;
      throw new BadRequestException(stockExceededMessage);
    }

    item.quantity = updateQuantity;
    await this.cartItemRepository.save(item);

    return this.getCart(userId);
  }

  async removeItem(
    userId: string,
    cartItemId: string,
  ): Promise<CartResponseDto> {
    const item = await this.cartItemRepository.findOne({
      where: { id: cartItemId, user: { id: userId } },
    });

    if (!item) {
      throw new NotFoundException('Không tìm thấy sản phẩm trong giỏ hàng');
    }

    await this.cartItemRepository.remove(item);
    return this.getCart(userId);
  }

  async clearCart(userId: string): Promise<CartResponseDto> {
    await this.cartItemRepository.delete({ user: { id: userId } });
    return this.getCart(userId);
  }

  async mergeCart(userId: string, dto: MergeCartDto): Promise<CartResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const cartItemRepo = manager.getRepository(CartItem);

      const dbCartItems = await cartItemRepo.find({
        where: { user: { id: userId } },
        relations: ['product', 'variant'],
      });

      let currentDistinctCount = dbCartItems.length;

      // Consolidate duplicate items in the guest cart to avoid multiple processing of the same product/variant
      const consolidatedGuestItems = new Map<string, (typeof dto.items)[0]>();
      for (const item of dto.items) {
        const key = `${item.product_id}_${item.variant_id ?? ''}`;
        const existing = consolidatedGuestItems.get(key);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          consolidatedGuestItems.set(key, { ...item });
        }
      }

      for (const guestItem of consolidatedGuestItems.values()) {
        let product: Product;
        try {
          product = await this.productsService.getProductForCartValidation(
            guestItem.product_id,
          );
        } catch (e) {
          continue;
        }

        if (!product || product.status === ProductStatus.DELETED) {
          continue;
        }

        if (product.shop?.seller?.id === userId) {
          continue;
        }

        if (product.has_variants) {
          if (!guestItem.variant_id) {
            continue;
          }
          const variantExists = product.variants?.some(
            (v) => v.id === guestItem.variant_id,
          );
          if (!variantExists) {
            continue;
          }
        } else if (guestItem.variant_id) {
          continue;
        }

        const existingDbItem = dbCartItems.find(
          (item) =>
            item.product?.id === guestItem.product_id &&
            ((!item.variant && !guestItem.variant_id) ||
              item.variant?.id === guestItem.variant_id),
        );

        if (existingDbItem) {
          const mergedQty = Math.min(
            existingDbItem.quantity + guestItem.quantity,
            CART_LIMITS.MAX_QUANTITY_PER_ITEM,
          );
          existingDbItem.quantity = mergedQty;
          await cartItemRepo.save(existingDbItem);
        } else {
          if (currentDistinctCount >= CART_LIMITS.MAX_DISTINCT_ITEMS) {
            continue;
          }

          const newCartItem = cartItemRepo.create({
            user: { id: userId } as any,
            product: { id: guestItem.product_id } as any,
            variant: guestItem.variant_id
              ? ({ id: guestItem.variant_id } as any)
              : null,
            quantity: Math.min(
              guestItem.quantity,
              CART_LIMITS.MAX_QUANTITY_PER_ITEM,
            ),
          });

          await cartItemRepo.save(newCartItem);
          currentDistinctCount++;
        }
      }
    });

    return this.getCart(userId);
  }
}
