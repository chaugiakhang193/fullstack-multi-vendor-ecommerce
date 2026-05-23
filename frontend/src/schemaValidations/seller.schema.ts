import z from "zod";
import type { components } from "@/lib/api/api-schema";

type UpdateShopSwaggerDto = components["schemas"]["UpdateShopSwaggerDto"];

// Schema cho form tạo gian hàng lần đầu (Setup Shop)
// Frontend có 3 input riêng cho thông tin ngân hàng, sẽ merge thành bank_account_info khi gửi API
export const CreateShopBody = z
  .object({
    name: z
      .string()
      .min(3, "Tên gian hàng phải từ 3 ký tự trở lên.")
      .max(50, "Tên gian hàng không được vượt quá 50 ký tự.")
      .trim(),
    description: z
      .string()
      .max(500, "Mô tả gian hàng không quá 500 ký tự.")
      .trim()
      .optional()
      .or(z.literal("")),
    pickup_address: z
      .string()
      .min(
        10,
        "Vui lòng nhập chi tiết địa chỉ lấy hàng (Số nhà, đường, xã/phường...).",
      )
      .trim(),
    bank_account_name: z
      .string()
      .min(1, "Vui lòng nhập tên chủ tài khoản ngân hàng (viết hoa không dấu).")
      .transform((val) => val.toUpperCase()), // Tự động convert chữ hoa cho chuẩn tài chính
    bank_account_number: z
      .string()
      .min(6, "Số tài khoản ngân hàng không hợp lệ.")
      .regex(/^[0-9]+$/, "Số tài khoản chỉ được phép chứa các chữ số."),
    bank_name: z.string().min(2, "Vui lòng nhập hoặc chọn tên ngân hàng."),
    categoryIds: z
      .array(z.string().uuid("ID danh mục không hợp lệ"))
      .min(1, "Gian hàng cần đăng ký ít nhất 1 danh mục kinh doanh."),
  })
  .strict();

export const UpdateShopBody = z
  .object({
    name: z
      .string()
      .min(3, "Tên cửa hàng phải từ 3 ký tự trở lên.")
      .max(100, "Tên cửa hàng không vượt quá 100 ký tự.")
      .optional(),
    description: z
      .string()
      .max(1000, "Mô tả cửa hàng không quá 1000 ký tự.")
      .nullable()
      .optional() as any,
    pickup_address: z
      .string()
      .min(5, "Địa chỉ lấy hàng phải từ 5 ký tự trở lên.")
      .optional(),
    bank_account_info: z
      .string()
      .min(5, "Thông tin ngân hàng phải từ 5 ký tự trở lên.")
      .optional(),
    logo: z.any().optional() as any,
    banner: z.any().optional() as any,
    gallery: z
      .array(z.any())
      .max(3, "Tối đa 3 ảnh bộ sưu tập.")
      .optional() as any,
  })
  .strict() satisfies z.ZodType<
  Omit<UpdateShopSwaggerDto, "categoryIds" | "logo_url" | "banner_url">
>;

export const ShopResponse = z.object({
  id: z.string(),
  name: z.string(),
  logo_url: z.string().nullable().optional(),
  banner_url: z.string().nullable().optional(),
  description: z.any().nullable().optional(),
  bank_account_info: z.string().nullable().optional(),
  pickup_address: z.string().nullable().optional(),
  status: z.string(),
  categories: z.array(z.any()),
  gallery: z.array(z.any()),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ShopResponseRes = z.object({
  statusCode: z.number().optional(),
  message: z.string().optional(),
  data: ShopResponse,
});

export type CreateShopBodyType = z.TypeOf<typeof CreateShopBody>;
export type UpdateShopBodyType = z.TypeOf<typeof UpdateShopBody>;

export type ShopResponseType = z.TypeOf<typeof ShopResponse>;
export type ShopResponseResType = z.TypeOf<typeof ShopResponseRes>;
