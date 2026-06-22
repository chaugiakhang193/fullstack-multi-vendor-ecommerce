import z from "zod";
import { CATEGORY_LIMITS } from "@/constants/limits";
import type { components } from "@/lib/api/api-schema";
import type { ApiEnvelope } from "@/lib/http";

type OriginalCreateCategoryDto = components["schemas"]["CreateCategoryDto"];
type OriginalUpdateCategoryDto = components["schemas"]["UpdateCategoryDto"];

type CreateCategoryDto = Omit<
  OriginalCreateCategoryDto,
  "parentId" | "display_order"
> & {
  parentId?: string | null;
  display_order?: number | null;
};

type UpdateCategoryDto = Omit<
  OriginalUpdateCategoryDto,
  "parentId" | "display_order"
> & {
  parentId?: string | null;
  display_order?: number | null;
};

export const CreateCategoryBody = z
  .object({
    name: z
      .string()
      .min(1, "Tên danh mục không được để trống.")
      .max(CATEGORY_LIMITS.NAME_MAX_LENGTH, "Tên danh mục không quá 255 ký tự."),
    parentId: z
      .string()
      .uuid("ID danh mục cha không đúng định dạng.")
      .or(z.literal("")) // Chấp nhận chuỗi rỗng từ select HTML
      .nullable()
      .optional(),
    display_order: z.preprocess((val) => {
      if (val === "" || val === undefined || val === null) return null;
      const num = Number(val);
      return Number.isNaN(num) ? null : num;
    }, z.number().int("Thứ tự hiển thị phải là số nguyên.").min(CATEGORY_LIMITS.MIN_DISPLAY_ORDER, "Thứ tự hiển thị không được nhỏ hơn 0.").nullable().optional()),
  })
  .strict() satisfies z.ZodType<CreateCategoryDto, any, any>;

export const UpdateCategoryBody = z
  .object({
    name: z
      .string()
      .min(1, "Tên danh mục không được để trống.")
      .max(CATEGORY_LIMITS.NAME_MAX_LENGTH, "Tên danh mục không quá 255 ký tự.")
      .optional(),
    parentId: z
      .string()
      .uuid("ID danh mục cha không đúng định dạng.")
      .or(z.literal("")) // Chấp nhận chuỗi rỗng từ select HTML
      .nullable()
      .optional(),
    display_order: z.preprocess((val) => {
      if (val === "" || val === undefined || val === null) return null;
      const num = Number(val);
      return Number.isNaN(num) ? null : num;
    }, z.number().int("Thứ tự hiển thị phải là số nguyên.").min(CATEGORY_LIMITS.MIN_DISPLAY_ORDER, "Thứ tự hiển thị không được nhỏ hơn 0.").nullable().optional()),
  })
  .strict() satisfies z.ZodType<Partial<UpdateCategoryDto>, any, any>;

export const CategoryResponse = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  parent: z.any().nullable().optional(),
  display_order: z.number(),
  children: z.array(z.any()).optional(),
  created_at: z.string(),
});

// ==========================================
// Types
// ==========================================
export type CreateCategoryBodyType = z.TypeOf<typeof CreateCategoryBody>;
export type UpdateCategoryBodyType = z.TypeOf<typeof UpdateCategoryBody>;

export type CategoryResponseType = z.TypeOf<typeof CategoryResponse>;
export type CategoryListResponseType = ApiEnvelope<CategoryResponseType[]>;
export type SingleCategoryResponseType = ApiEnvelope<CategoryResponseType>;
