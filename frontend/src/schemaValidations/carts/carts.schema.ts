import z from "zod";
import { CART_LIMITS } from "@/constants/limits.generated";
import type { components } from "@/lib/api/api-schema";
import type { ApiEnvelope } from "@/lib/http";

type AddCartItemDto = components["schemas"]["AddCartItemDto"];
type UpdateCartItemDto = components["schemas"]["UpdateCartItemDto"];
type GuestCartItemDto = components["schemas"]["GuestCartItemDto"];
type MergeCartDto = components["schemas"]["MergeCartDto"];
type CartShopDto = components["schemas"]["CartShopDto"];
type CartItemProductDto = components["schemas"]["CartItemProductDto"];
type CartItemVariantDto = components["schemas"]["CartItemVariantDto"];
type CartResponseDto = components["schemas"]["CartResponseDto"];

export const AddCartItemBody = z
  .object({
    product_id: z.string().uuid("ID sản phẩm không hợp lệ."),
    variant_id: z.string().uuid("ID biến thể không hợp lệ.").optional(),
    quantity: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .int("Số lượng phải là số nguyên.")
      .min(CART_LIMITS.MIN_QUANTITY_PER_ITEM, "Số lượng tối thiểu là 1.")
      .max(CART_LIMITS.MAX_QUANTITY_PER_ITEM, "Số lượng tối đa là 99.")
      .default(1),
  })
  .strict() satisfies z.ZodType<AddCartItemDto, any, any>;

export const UpdateCartItemBody = z
  .object({
    quantity: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .int("Số lượng phải là số nguyên.")
      .min(CART_LIMITS.MIN_QUANTITY_PER_ITEM, "Số lượng tối thiểu là 1.")
      .max(CART_LIMITS.MAX_QUANTITY_PER_ITEM, "Số lượng tối đa là 99."),
  })
  .strict() satisfies z.ZodType<UpdateCartItemDto, any, any>;

export const GuestCartItem = z
  .object({
    product_id: z.string().uuid("ID sản phẩm không hợp lệ."),
    variant_id: z.string().uuid("ID biến thể không hợp lệ.").optional(),
    quantity: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .int("Số lượng phải là số nguyên.")
      .min(CART_LIMITS.MIN_QUANTITY_PER_ITEM, "Số lượng tối thiểu là 1.")
      .max(CART_LIMITS.MAX_QUANTITY_PER_ITEM, "Số lượng tối đa là 99."),
  })
  .strict() satisfies z.ZodType<GuestCartItemDto, any, any>;
export const MergeCartBody = z
  .object({
    items: z.array(GuestCartItem),
  })
  .strict() satisfies z.ZodType<MergeCartDto, any, any>;export const CartShop = z.object({
  id: z.string(),
  name: z.string(),
  logo_url: z.any() as z.ZodType<CartShopDto["logo_url"]>,
}) satisfies z.ZodType<CartShopDto, any, any>;

export const CartItemProduct = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  price: z.number(),
  thumbnail_url: z.any() as z.ZodType<CartItemProductDto["thumbnail_url"]>,
  is_hidden: z.boolean(),
  status: z.enum(["active", "deleted"]),
}) satisfies z.ZodType<CartItemProductDto, any, any>;
export const CartItemVariant = z.object({
  id: z.string(),
  name: z.string(),
  additional_price: z.number(),
  images: z.array(z.string()).nullable(),
}) satisfies z.ZodType<CartItemVariantDto, any, any>;

export const CartItemResponse = z.object({
  id: z.string(),
  product: CartItemProduct,
  variant: CartItemVariant.nullable(),
  quantity: z.number(),
  unit_price: z.number(),
  subtotal: z.number(),
  added_at: z.string(),
  available_stock: z.number(),
  is_available: z.boolean(),
  reason: z.enum(["out_of_stock", "insufficient_stock", "product_hidden", "product_deleted", "shop_inactive"]).optional(),
});

export const CartShopGroup = z.object({
  shop: CartShop,
  items: z.array(CartItemResponse),
  shop_subtotal: z.number(),
});

export const CartResponse = z.object({
  items_by_shop: z.array(CartShopGroup),
  total_items: z.number(),
  total_quantity: z.number(),
  total_amount: z.number(),
}) satisfies z.ZodType<CartResponseDto, any, any>;

// ==========================================
// Types
// ==========================================
export type AddCartItemBodyType = z.TypeOf<typeof AddCartItemBody>;
export type UpdateCartItemBodyType = z.TypeOf<typeof UpdateCartItemBody>;
export type GuestCartItemType = z.TypeOf<typeof GuestCartItem>;
export type MergeCartBodyType = z.TypeOf<typeof MergeCartBody>;

export type CartResponseType = z.TypeOf<typeof CartResponse>;
export type CartGenericResponseType = ApiEnvelope<CartResponseType>;

export type CartItemResponseType = z.TypeOf<typeof CartItemResponse>;
export type CartShopGroupType = z.TypeOf<typeof CartShopGroup>;
