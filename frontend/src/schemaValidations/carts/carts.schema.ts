import z from "zod";
import { CART_LIMITS } from "@/constants/limits";
import type { components } from "@/lib/api/api-schema";

type AddCartItemDto = components["schemas"]["AddCartItemDto"];
type UpdateCartItemDto = components["schemas"]["UpdateCartItemDto"];
type GuestCartItemDto = components["schemas"]["GuestCartItemDto"];
type MergeCartDto = components["schemas"]["MergeCartDto"];

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
  .strict() satisfies z.ZodType<MergeCartDto, any, any>;

// ==========================================
// Types
// ==========================================
export type AddCartItemBodyType = z.TypeOf<typeof AddCartItemBody>;
export type UpdateCartItemBodyType = z.TypeOf<typeof UpdateCartItemBody>;
export type GuestCartItemType = z.TypeOf<typeof GuestCartItem>;
export type MergeCartBodyType = z.TypeOf<typeof MergeCartBody>;
