import z from "zod";
import { SHOP_LIMITS } from "@/constants/limits";
import type { components } from "@/lib/api/api-schema";
import type { ApiEnvelope } from "@/lib/http";

type UpdateShopSwaggerDto = components["schemas"]["UpdateShopSwaggerDto"];
type RejectShopDto = components["schemas"]["RejectShopDto"];
export const BankAccountInfoSchema = z.object({
  bank_name: z.string().min(1, "Tên ngân hàng không được để trống"),
  account_number: z.string().min(1, "Số tài khoản không được để trống"),
  account_holder: z.string().min(1, "Tên chủ tài khoản không được để trống"),
});

// Schema cho form tạo gian hàng lần đầu (Setup Shop)
// Frontend có 3 input riêng cho thông tin ngân hàng, sẽ merge thành bank_account_info khi gửi API
export const CreateShopBody = z
  .object({
    name: z
      .string()
      .min(SHOP_LIMITS.CREATE.NAME_MIN_LENGTH, "Tên gian hàng phải từ 3 ký tự trở lên.")
      .max(SHOP_LIMITS.SHOP_NAME_MAX_LENGTH, "Tên gian hàng không được vượt quá 100 ký tự.")
      .trim(),
    description: z
      .string()
      .max(SHOP_LIMITS.SHOP_DESCRIPTION_MAX_LENGTH, "Mô tả gian hàng không quá 1000 ký tự.")
      .trim()
      .optional()
      .or(z.literal("")),
    pickup_address: z
      .string()
      .min(
        SHOP_LIMITS.CREATE.PICKUP_ADDRESS_MIN_LENGTH,
        "Vui lòng nhập chi tiết địa chỉ lấy hàng (Số nhà, đường, xã/phường...).",
      )
      .trim(),
    account_holder: z
      .string()
      .min(SHOP_LIMITS.CREATE.BANK_ACCOUNT_NAME_MIN_LENGTH, "Vui lòng nhập tên chủ tài khoản ngân hàng (viết hoa không dấu).")
      .transform((val) => val.toUpperCase()), // Tự động convert chữ hoa cho chuẩn tài chính
    account_number: z
      .string()
      .min(SHOP_LIMITS.CREATE.BANK_ACCOUNT_NUMBER_MIN_LENGTH, "Số tài khoản ngân hàng không hợp lệ.")
      .regex(/^[0-9]+$/, "Số tài khoản chỉ được phép chứa các chữ số."),
    bank_name: z.string().min(SHOP_LIMITS.CREATE.BANK_NAME_MIN_LENGTH, "Vui lòng nhập hoặc chọn tên ngân hàng."),
    categoryIds: z
      .array(z.string().uuid("ID danh mục không hợp lệ"))
      .min(SHOP_LIMITS.CREATE.MIN_CATEGORIES, "Gian hàng cần đăng ký ít nhất 1 danh mục kinh doanh."),
  })
  .strict();

export const UpdateShopBody = z
  .object({
    name: z
      .string()
      .min(SHOP_LIMITS.UPDATE.NAME_MIN_LENGTH, "Tên cửa hàng phải từ 3 ký tự trở lên.")
      .max(SHOP_LIMITS.SHOP_NAME_MAX_LENGTH, "Tên cửa hàng không vượt quá 100 ký tự.")
      .optional(),
    description: z
      .string()
      .max(SHOP_LIMITS.SHOP_DESCRIPTION_MAX_LENGTH, "Mô tả cửa hàng không quá 1000 ký tự.")
      .nullable()
      .optional() as any,
    pickup_address: z
      .string()
      .min(SHOP_LIMITS.UPDATE.PICKUP_ADDRESS_MIN_LENGTH, "Địa chỉ lấy hàng phải từ 10 ký tự trở lên.")
      .optional(),
    bank_account_info: BankAccountInfoSchema.optional(),
    logo: z.any().optional() as any,
    banner: z.any().optional() as any,
    gallery: z
      .array(z.any())
      .max(SHOP_LIMITS.UPDATE.MAX_GALLERY_IMAGES, "Tối đa 3 ảnh bộ sưu tập.")
      .optional() as any,
  })
  .strict() satisfies z.ZodType<
  Omit<UpdateShopSwaggerDto, "categoryIds" | "logo_url" | "banner_url">
>;

// Schema duyệt/từ chối shop của admin
export const RejectShopBody = z
  .object({
    reason: z.string().min(SHOP_LIMITS.REJECT.REASON_MIN_LENGTH, "Lý do từ chối phải có ít nhất 5 ký tự."),
  })
  .strict() satisfies z.ZodType<RejectShopDto, any, any>;

export const ShopResponse = z.object({
  id: z.string(),
  name: z.string(),
  logo_url: z.string().nullable().optional(),
  banner_url: z.string().nullable().optional(),
  description: z.any().nullable().optional(),
  bank_account_info: BankAccountInfoSchema.nullable().optional(),
  pickup_address: z.string().nullable().optional(),
  lat: z.string().nullable().optional(),
  lng: z.string().nullable().optional(),
  is_coordinates_verified: z.boolean().optional(),
  reject_reason: z.string().nullable().optional(),
  status: z.string(),
  categories: z.array(z.any()),
  gallery: z.array(z.any()),
  seller: z
    .object({
      id: z.string(),
      username: z.string(),
      email: z.string(),
      full_name: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
// ==========================================
// Types
// ==========================================
export type CreateShopBodyType = z.TypeOf<typeof CreateShopBody>;
export type UpdateShopBodyType = z.TypeOf<typeof UpdateShopBody>;
export type RejectShopBodyType = z.TypeOf<typeof RejectShopBody>;

export type ShopResponseType = z.TypeOf<typeof ShopResponse>;
export type ShopResponseResType = ApiEnvelope<ShopResponseType>;

export type ShopType = components["schemas"]["ShopResponseDto"];
export type GetPendingShopsResType = ApiEnvelope<ShopType[]>;
export type ActionShopResType = ApiEnvelope<ShopType>;
