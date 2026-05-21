import z from "zod";
import type { components } from "@/lib/api/api-schema";

type CreateCategoryDto = components["schemas"]["CreateCategoryDto"];
type UpdateCategoryDto = components["schemas"]["UpdateCategoryDto"];

export const CreateCategoryBody = z
  .object({
    name: z
      .string()
      .min(1, "Tên danh mục không được để trống.")
      .max(255, "Tên danh mục không quá 255 ký tự."),
    parentId: z
      .string()
      .uuid("ID danh mục cha không đúng định dạng.")
      .or(z.literal("")) // Chấp nhận chuỗi rỗng từ select HTML
      .nullable()
      .optional() as any,
    display_order: z
      .number({ invalid_type_error: "Vui lòng nhập một số hợp lệ." }) // Tránh lỗi undefined khi xóa trống input
      .int("Thứ tự hiển thị phải là số nguyên.")
      .min(0, "Thứ tự hiển thị không được nhỏ hơn 0.")
      .default(0),
  })
  .strict() satisfies z.ZodType<CreateCategoryDto, any, any>;

export const UpdateCategoryBody = z
  .object({
    name: z
      .string()
      .min(1, "Tên danh mục không được để trống.")
      .max(255, "Tên danh mục không quá 255 ký tự.")
      .optional(),
    parentId: z
      .string()
      .uuid("ID danh mục cha không đúng định dạng.")
      .or(z.literal("")) // Chấp nhận chuỗi rỗng từ select HTML
      .nullable()
      .optional() as any,
    display_order: z
      .number({ invalid_type_error: "Vui lòng nhập một số hợp lệ." })
      .int("Thứ tự hiển thị phải là số nguyên.")
      .min(0, "Thứ tự hiển thị không được nhỏ hơn 0.")
      .optional(),
  })
  .strict() satisfies z.ZodType<Partial<UpdateCategoryDto>>;

export const CategoryResponse = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  parent: z.any().nullable().optional(),
  display_order: z.number(),
  children: z.array(z.any()).optional(),
  created_at: z.string(),
});

export const CategoryListResponse = z.object({
  statusCode: z.number().optional(),
  message: z.string().optional(),
  data: z.array(CategoryResponse),
});

export const SingleCategoryResponse = z.object({
  statusCode: z.number().optional(),
  message: z.string().optional(),
  data: CategoryResponse,
});

// BẮT BUỘC: Đặt các type ở dưới cùng của file theo quy ước cặp
export type CreateCategoryBodyType = z.TypeOf<typeof CreateCategoryBody>;
export type UpdateCategoryBodyType = z.TypeOf<typeof UpdateCategoryBody>;

export type CategoryResponseType = z.TypeOf<typeof CategoryResponse>;
export type CategoryListResponseType = z.TypeOf<typeof CategoryListResponse>;
export type SingleCategoryResponseType = z.TypeOf<
  typeof SingleCategoryResponse
>;
