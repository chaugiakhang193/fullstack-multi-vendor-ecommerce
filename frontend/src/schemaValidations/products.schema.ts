import z from "zod";
import type { components } from "@/lib/api/api-schema";

// Trích xuất backend types để đảm bảo đồng bộ compile-time
type CreateProductVariantDto = components["schemas"]["CreateProductVariantDto"];
type UpdateProductVariantDto = components["schemas"]["UpdateProductVariantDto"];
type CreateProductSwaggerDto = components["schemas"]["CreateProductSwaggerDto"];
type UpdateProductSwaggerDto = components["schemas"]["UpdateProductSwaggerDto"];

// Schema biến thể khi tạo mới sản phẩm
export const CreateProductVariantBody = z
  .object({
    name: z
      .string()
      .min(1, "Tên biến thể không được để trống.")
      .max(100, "Tên biến thể không quá 100 ký tự."),
    additional_price: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .min(0, "Giá thêm không được âm.")
      .default(0),
    sku: z.string().default(""),
    stock_quantity: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .int("Tồn kho phải là số nguyên.")
      .min(0, "Tồn kho không được âm."),
    imageCount: z
      .number()
      .int("Số lượng ảnh phải là số nguyên.")
      .min(1, "Biến thể cần ít nhất 1 ảnh.")
      .max(3, "Biến thể tối đa 3 ảnh."),
  })
  .strict() satisfies z.ZodType<CreateProductVariantDto, any, any>;

// Schema biến thể khi cập nhật sản phẩm
// Mở rộng UpdateProductVariantDto (chỉ có id?, existingImages?, imageCount)
// thêm các trường form cần thiết cho UI

export type UpdateProductVariantFormType = UpdateProductVariantDto & {
  name: string;
  additional_price: number;
  sku?: string;
  stock_quantity: number;
};

export const UpdateProductVariantBody = z
  .object({
    id: z.string().uuid("ID biến thể không hợp lệ.").optional(),
    existingImages: z.array(z.string()).optional(),
    imageCount: z
      .number()
      .int("Số lượng ảnh phải là số nguyên.")
      .min(0, "Số lượng ảnh không được âm.")
      .default(0),
    // Các trường UI bổ sung (không có trong UpdateProductVariantDto swagger)
    name: z
      .string()
      .min(1, "Tên biến thể không được để trống.")
      .max(100, "Tên biến thể không quá 100 ký tự."),
    additional_price: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .min(0, "Giá thêm không được âm.")
      .default(0),
    sku: z.string().optional(),
    stock_quantity: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .int("Tồn kho phải là số nguyên.")
      .min(0, "Tồn kho không được âm."),
  })
  .strict() satisfies z.ZodType<UpdateProductVariantFormType, any, any>;

// Schema tạo sản phẩm mới (không bao gồm các trường file binary)
// Khớp với CreateProductSwaggerDto (bỏ thumbnail, general_gallery, variant_images)
type CleanCreateProductDto = Omit<
  CreateProductSwaggerDto,
  "thumbnail" | "general_gallery" | "variant_images"
>;
export const CreateProductBody = z
  .object({
    name: z
      .string()
      .min(1, "Tên sản phẩm không được để trống.")
      .max(200, "Tên sản phẩm không quá 200 ký tự."),
    description: z.string().optional(),
    price: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .min(0, "Giá sản phẩm không được âm."),
    sku: z.string().default(""),
    weight: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .min(1, "Trọng lượng phải ít nhất 1 gram."),
    length: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .min(0, "Chiều dài không được âm.")
      .optional(),
    width: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .min(0, "Chiều rộng không được âm.")
      .optional(),
    height: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .min(0, "Chiều cao không được âm.")
      .optional(),
    category_id: z.string().min(1, "Vui lòng chọn danh mục."),
    stock_quantity: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .int("Tồn kho phải là số nguyên.")
      .min(0, "Tồn kho không được âm.")
      .optional(),
    has_variants: z.boolean(),
    variants: z.array(CreateProductVariantBody).optional(),
  })
  .strict() satisfies z.ZodType<CleanCreateProductDto, any, any>;

// Schema cập nhật sản phẩm (không bao gồm các trường file binary)
// Khớp với UpdateProductSwaggerDto (bỏ thumbnail, general_gallery, variant_images)

type CleanUpdateProductDto = Omit<
  UpdateProductSwaggerDto,
  "thumbnail" | "general_gallery" | "variant_images"
>;

// SỬA: Định nghĩa kiểu dữ liệu kết hợp cho Form Cập nhật vì mảng variants chứa các trường UI nâng cao
type UpdateProductFormType = Omit<CleanUpdateProductDto, "variants"> & {
  variants?: UpdateProductVariantFormType[];
};

export const UpdateProductBody = z
  .object({
    name: z
      .string()
      .min(1, "Tên sản phẩm không được để trống.")
      .max(200, "Tên sản phẩm không quá 200 ký tự.")
      .optional(),
    description: z.string().optional(),
    price: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .min(0, "Giá sản phẩm không được âm.")
      .optional(),
    sku: z.string().optional(),
    weight: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .min(1, "Trọng lượng phải ít nhất 1 gram.")
      .optional(),
    length: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .min(0, "Chiều dài không được âm.")
      .optional(),
    width: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .min(0, "Chiều rộng không được âm.")
      .optional(),
    height: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .min(0, "Chiều cao không được âm.")
      .optional(),
    category_id: z.string().min(1, "Vui lòng chọn danh mục.").optional(),
    stock_quantity: z
      .number({ invalid_type_error: "Vui lòng nhập số hợp lệ." })
      .int("Tồn kho phải là số nguyên.")
      .min(0, "Tồn kho không được âm.")
      .optional(),
    has_variants: z.boolean().optional(),
    status: z.enum(["active", "deleted"]).optional(),
    is_hidden: z.boolean().optional(),
    variants: z.array(UpdateProductVariantBody).optional(),
    existingGalleryImages: z.array(z.string()).optional(),
  })
  .strict() satisfies z.ZodType<UpdateProductFormType, any, any>;

// Schema response cho 1 biến thể sản phẩm
export const ProductVariantResponse = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string(),
  additional_price: z.number(),
  stock_quantity: z.number(),
  images: z.array(z.string()),
});

// Schema response cho 1 sản phẩm
export const ProductResponse = z.object({
  id: z.string(),
  shop: z.any().optional(),
  name: z.string(),
  slug: z.string(),
  sku: z.any().nullable(),
  description: z.any().nullable(),
  price: z.number(),
  weight: z.number(),
  length: z.any().nullable(),
  width: z.any().nullable(),
  height: z.any().nullable(),
  category: z.any().optional(),
  variants: z.array(ProductVariantResponse),
  thumbnail_url: z.any().nullable(),
  gallery: z.any().nullable(),
  aggregated_gallery: z.array(z.string()),
  stock_quantity: z.number(),
  has_variants: z.boolean(),
  is_hidden: z.boolean(),
  is_featured: z.boolean(),
  status: z.enum(["active", "deleted"]),
  created_at: z.string(),
  updated_at: z.string(),
});

// Schema response danh sách sản phẩm
export const ProductListResponse = z.object({
  statusCode: z.number().optional(),
  message: z.string().optional(),
  data: z.array(ProductResponse),
});

// Schema response 1 sản phẩm
export const SingleProductResponse = z.object({
  statusCode: z.number().optional(),
  message: z.string().optional(),
  data: ProductResponse,
});

export type CreateProductVariantBodyType = z.TypeOf<
  typeof CreateProductVariantBody
>;
export type UpdateProductVariantBodyType = z.TypeOf<
  typeof UpdateProductVariantBody
>;

export type CreateProductBodyType = z.TypeOf<typeof CreateProductBody>;
export type UpdateProductBodyType = z.TypeOf<typeof UpdateProductBody>;

export type ProductVariantResponseType = z.TypeOf<
  typeof ProductVariantResponse
>;
export type ProductResponseType = z.TypeOf<typeof ProductResponse>;

export type ProductListResponseType = z.TypeOf<typeof ProductListResponse>;
export type SingleProductResponseType = z.TypeOf<typeof SingleProductResponse>;
