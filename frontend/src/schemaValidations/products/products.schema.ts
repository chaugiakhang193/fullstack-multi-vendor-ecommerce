import z from 'zod';
import { PRODUCT_LIMITS } from '@/constants/limits.generated';
import type { components } from '@/lib/api/api-schema';
import type { ApiEnvelope } from '@/lib/http';

// Trích xuất backend types để đảm bảo đồng bộ compile-time
type CreateProductVariantDto = components['schemas']['CreateProductVariantDto'];
type UpdateProductVariantDto = components['schemas']['UpdateProductVariantDto'];
type CreateProductSwaggerDto = components['schemas']['CreateProductSwaggerDto'];
type UpdateProductSwaggerDto = components['schemas']['UpdateProductSwaggerDto'];

export type UpdateProductVariantFormType = UpdateProductVariantDto & {
  name: string;
  additional_price: number;
  sku?: string;
  stock_quantity: number;
};

type CleanCreateProductDto = Omit<
  CreateProductSwaggerDto,
  'thumbnail' | 'general_gallery' | 'variant_images'
>;

type CleanUpdateProductDto = Omit<
  UpdateProductSwaggerDto,
  'thumbnail' | 'general_gallery' | 'variant_images'
>;

type UpdateProductFormType = Omit<CleanUpdateProductDto, 'variants'> & {
  variants?: UpdateProductVariantFormType[];
};

// Schema biến thể khi tạo mới sản phẩm
export const CreateProductVariantBody = z
  .object({
    name: z
      .string()
      .min(PRODUCT_LIMITS.NAME_MIN_LENGTH, 'Tên biến thể không được để trống.')
      .max(
        PRODUCT_LIMITS.VARIANT.NAME_MAX_LENGTH,
        'Tên biến thể không quá 100 ký tự.',
      ),
    additional_price: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .min(PRODUCT_LIMITS.VARIANT.MIN_PRICE, 'Giá thêm không được âm.')
      .default(0),
    sku: z.string().default(''),
    stock_quantity: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .int('Tồn kho phải là số nguyên.')
      .min(PRODUCT_LIMITS.VARIANT.MIN_STOCK, 'Tồn kho không được âm.'),
    imageCount: z
      .number()
      .int('Số lượng ảnh phải là số nguyên.')
      .min(PRODUCT_LIMITS.VARIANT.MIN_IMAGES, 'Biến thể cần ít nhất 1 ảnh.')
      .max(PRODUCT_LIMITS.VARIANT.MAX_IMAGES, 'Biến thể tối đa 3 ảnh.'),
  })
  .strict() satisfies z.ZodType<CreateProductVariantDto, any, any>;

// Schema biến thể khi cập nhật sản phẩm
export const UpdateProductVariantBody = z
  .object({
    id: z.string().uuid('ID biến thể không hợp lệ.').optional(),
    existingImages: z.array(z.string()).optional(),
    imageCount: z
      .number()
      .int('Số lượng ảnh phải là số nguyên.')
      .min(PRODUCT_LIMITS.MIN_STOCK, 'Số lượng ảnh không được âm.')
      .default(0),
    // Các trường UI bổ sung (không có trong UpdateProductVariantDto swagger)
    name: z
      .string()
      .min(PRODUCT_LIMITS.NAME_MIN_LENGTH, 'Tên biến thể không được để trống.')
      .max(
        PRODUCT_LIMITS.VARIANT.NAME_MAX_LENGTH,
        'Tên biến thể không quá 100 ký tự.',
      ),
    additional_price: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .min(PRODUCT_LIMITS.VARIANT.MIN_PRICE, 'Giá thêm không được âm.')
      .default(0),
    sku: z.string().optional(),
    stock_quantity: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .int('Tồn kho phải là số nguyên.')
      .min(PRODUCT_LIMITS.VARIANT.MIN_STOCK, 'Tồn kho không được âm.'),
  })
  .strict() satisfies z.ZodType<UpdateProductVariantFormType, any, any>;

// Schema tạo sản phẩm mới (không bao gồm các trường file binary)
export const CreateProductBody = z
  .object({
    name: z
      .string()
      .min(PRODUCT_LIMITS.NAME_MIN_LENGTH, 'Tên sản phẩm không được để trống.')
      .max(PRODUCT_LIMITS.NAME_MAX_LENGTH, 'Tên sản phẩm không quá 200 ký tự.'),
    description: z.string().optional(),
    price: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .min(PRODUCT_LIMITS.MIN_PRICE, 'Giá sản phẩm không được âm.'),
    sku: z.string().default(''),
    weight: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .min(PRODUCT_LIMITS.MIN_WEIGHT, 'Trọng lượng phải ít nhất 1 gram.'),
    length: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .min(PRODUCT_LIMITS.MIN_DIMENSION, 'Chiều dài phải ít nhất 1 cm.')
      .optional(),
    width: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .min(PRODUCT_LIMITS.MIN_DIMENSION, 'Chiều rộng phải ít nhất 1 cm.')
      .optional(),
    height: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .min(PRODUCT_LIMITS.MIN_DIMENSION, 'Chiều cao phải ít nhất 1 cm.')
      .optional(),
    category_id: z.string().min(1, 'Vui lòng chọn danh mục.'),
    stock_quantity: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .int('Tồn kho phải là số nguyên.')
      .min(PRODUCT_LIMITS.MIN_STOCK, 'Tồn kho không được âm.')
      .optional(),
    has_variants: z.boolean(),
    variants: z
      .array(CreateProductVariantBody)
      .max(
        PRODUCT_LIMITS.MAX_VARIANTS,
        'Sản phẩm chỉ được phép có tối đa 30 biến thể.',
      )
      .optional(),
  })
  .strict() satisfies z.ZodType<CleanCreateProductDto, any, any>;

// Schema cập nhật sản phẩm (không bao gồm các trường file binary)
export const UpdateProductBody = z
  .object({
    name: z
      .string()
      .min(PRODUCT_LIMITS.NAME_MIN_LENGTH, 'Tên sản phẩm không được để trống.')
      .max(PRODUCT_LIMITS.NAME_MAX_LENGTH, 'Tên sản phẩm không quá 200 ký tự.')
      .optional(),
    description: z.string().optional(),
    price: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .min(PRODUCT_LIMITS.MIN_PRICE, 'Giá sản phẩm không được âm.')
      .optional(),
    sku: z.string().optional(),
    weight: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .min(PRODUCT_LIMITS.MIN_WEIGHT, 'Trọng lượng phải ít nhất 1 gram.')
      .optional(),
    length: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .min(PRODUCT_LIMITS.MIN_DIMENSION, 'Chiều dài phải ít nhất 1 cm.')
      .optional(),
    width: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .min(PRODUCT_LIMITS.MIN_DIMENSION, 'Chiều rộng phải ít nhất 1 cm.')
      .optional(),
    height: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .min(PRODUCT_LIMITS.MIN_DIMENSION, 'Chiều cao phải ít nhất 1 cm.')
      .optional(),
    category_id: z.string().min(1, 'Vui lòng chọn danh mục.').optional(),
    stock_quantity: z
      .number({ invalid_type_error: 'Vui lòng nhập số hợp lệ.' })
      .int('Tồn kho phải là số nguyên.')
      .min(PRODUCT_LIMITS.MIN_STOCK, 'Tồn kho không được âm.')
      .optional(),
    has_variants: z.boolean().optional(),
    status: z.enum(['active', 'deleted']).optional(),
    is_hidden: z.boolean().optional(),
    variants: z
      .array(UpdateProductVariantBody)
      .max(
        PRODUCT_LIMITS.MAX_VARIANTS,
        'Sản phẩm chỉ được phép có tối đa 30 biến thể.',
      )
      .optional(),
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
  attributes: z.record(z.string()).nullable().optional(),
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
  status: z.enum(['active', 'deleted']),
  created_at: z.string(),
  updated_at: z.string(),
  avg_rating: z.coerce.number().optional().nullable(),
  review_count: z.coerce.number().optional().nullable(),
});

export const PaginationMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
});

export const ProductListData = z.object({
  items: z.array(ProductResponse),
  meta: PaginationMetaSchema,
});

// ==========================================
// Types
// ==========================================
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

export type ProductListResponseType = ApiEnvelope<
  z.TypeOf<typeof ProductListData>
>;
export type SingleProductResponseType = ApiEnvelope<ProductResponseType>;
