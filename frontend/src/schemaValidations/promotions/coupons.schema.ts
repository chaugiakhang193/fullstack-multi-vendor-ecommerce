import z from "zod";
import { CouponType, DiscountType } from "@/constants/enum";
import type { ApiEnvelope } from "@/lib/http";
import type { components } from "@/lib/api/api-schema";

// Trích xuất backend types để đảm bảo đồng bộ compile-time
type CreateCouponDto = components["schemas"]["CreateCouponDto"];
type UpdateCouponDto = components["schemas"]["UpdateCouponDto"];

// ==========================================
// Core Schemas
// ==========================================

export const CouponSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1, "Mã code không được để trống"),
  type: z.nativeEnum(CouponType),
  discount_type: z.nativeEnum(DiscountType),
  discount_value: z.coerce.number().positive("Giá trị giảm phải lớn hơn 0"),
  min_order_value: z.coerce.number().nullable().default(0),
  max_discount_value: z.coerce.number().nonnegative().nullable().optional(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  usage_limit: z.coerce.number().int().positive().nullable().optional(),
  used_count: z.number().int().default(0),
  shop: z.object({
    id: z.string(),
    name: z.string(),
  }).nullable().optional(),
});

export const UserCouponSchema = z.object({
  id: z.string().uuid(),
  is_used: z.boolean(),
  used_at: z.string().nullable().optional(),
  coupon: CouponSchema,
});

// ==========================================
// Request Body Schemas
// ==========================================

// Chuẩn hoá number tuỳ chọn nhập từ form: ô trống ("") / null / undefined đều coi
// như "không nhập" → undefined, để backend lưu NULL. Tránh việc z.coerce.number("")
// = 0 vừa làm fail validate (usage_limit), vừa âm thầm lưu nhầm 0
// (max_discount_value: cap giảm tối đa = 0đ → coupon % giảm 0đ).
const optionalNumber = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : val),
    schema,
  );

export const CouponBodyObject = z.object({
  code: z.string().min(3, "Mã giảm giá phải có tối thiểu 3 ký tự").max(20, "Mã giảm giá tối đa 20 ký tự"),
  discount_type: z.nativeEnum(DiscountType),
  discount_value: z.coerce.number().positive("Giá trị giảm phải lớn hơn 0"),
  min_order_value: optionalNumber(z.coerce.number().nonnegative("Giá trị đơn hàng tối thiểu không được âm").optional()),
  max_discount_value: optionalNumber(z.coerce.number().nonnegative("Giá trị giảm tối đa không được âm").optional()),
  start_date: z.string().min(1, "Ngày bắt đầu không được để trống"),
  end_date: z.string().min(1, "Ngày kết thúc không được để trống"),
  usage_limit: optionalNumber(z.coerce.number().int().positive("Giới hạn lượt dùng phải là số dương").optional()),
  // Input để 'unknown' vì optionalNumber dùng z.preprocess (nhận "" từ form);
  // vẫn ràng buộc OUTPUT khớp CreateCouponDto để đồng bộ compile-time với backend.
}) satisfies z.ZodType<CreateCouponDto, z.ZodTypeDef, unknown>;

export const CreateCouponBody = CouponBodyObject
  .refine((data) => {
    if (data.start_date && data.end_date) {
      return new Date(data.end_date) > new Date(data.start_date);
    }
    return true;
  }, {
    message: "Ngày kết thúc phải sau ngày bắt đầu",
    path: ["end_date"],
  })
  // Với loại giảm theo %, giá trị phải nằm trong 1–100. Loại fixed_amount không giới hạn.
  .refine(
    (data) =>
      data.discount_type !== DiscountType.PERCENTAGE ||
      (data.discount_value >= 1 && data.discount_value <= 100),
    {
      message: "Phần trăm giảm giá phải nằm trong khoảng 1 - 100",
      path: ["discount_value"],
    },
  );

export const UpdateCouponBody = CouponBodyObject.partial() satisfies z.ZodType<UpdateCouponDto, z.ZodTypeDef, unknown>;

export const CouponQuery = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  type: z.nativeEnum(CouponType).optional(),
});

// ==========================================
// Response Schemas
// ==========================================

export const CouponPaginationMeta = z.object({
  page: z.number(),
  limit: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
});

export const CouponListResponse = z.object({
  items: z.array(CouponSchema),
  meta: CouponPaginationMeta,
});

export const UserCouponListResponse = z.object({
  items: z.array(UserCouponSchema),
  meta: CouponPaginationMeta,
});

// ==========================================
// Types
// ==========================================

export type CouponTypeObj = z.TypeOf<typeof CouponSchema>;
export type CouponDetailEnvelope = ApiEnvelope<CouponTypeObj>;

export type UserCouponTypeObj = z.TypeOf<typeof UserCouponSchema>;
export type UserCouponDetailEnvelope = ApiEnvelope<UserCouponTypeObj>;

export type CreateCouponBodyType = z.TypeOf<typeof CreateCouponBody>;
export type UpdateCouponBodyType = z.TypeOf<typeof UpdateCouponBody>;

export type CouponQueryType = z.TypeOf<typeof CouponQuery>;
export type CouponListEnvelope = ApiEnvelope<z.TypeOf<typeof CouponListResponse>>;

export type UserCouponListEnvelope = ApiEnvelope<z.TypeOf<typeof UserCouponListResponse>>;
