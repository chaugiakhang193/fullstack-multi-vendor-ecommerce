import { ApiProperty } from '@nestjs/swagger';
import { CategoryResponseDto } from '@/modules/products/dto/category-response.dto';
import { ShopResponseDto } from '@/modules/shops/dto/shop-response.dto';
import { ProductStatus } from '@/common/enums';

export class ProductVariantResponseDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440003',
    description: 'ID của biến thể',
  })
  id: string;

  @ApiProperty({
    example: 'Màu đỏ - Size L',
    description: 'Tên hoặc thuộc tính của biến thể',
  })
  name: string;

  @ApiProperty({
    example: { color: 'Đỏ', size: 'L' },
    description:
      'Các thuộc tính chi tiết của biến thể (Màu sắc, Kích thước...)',
    required: false,
  })
  attributes: Record<string, string>;

  @ApiProperty({
    example: 'SKU-RED-L',
    description: 'Mã định danh kho hàng của biến thể',
  })
  sku: string;

  @ApiProperty({
    example: 15000.0,
    description: 'Giá cộng thêm so với giá gốc sản phẩm',
  })
  additional_price: number;

  @ApiProperty({
    example: 50,
    description: 'Số lượng tồn kho của biến thể này',
  })
  stock_quantity: number;

  @ApiProperty({
    example: [
      'https://res.cloudinary.com/cloudinary-name/image/upload/v12345/products/variants/img1.jpg',
    ],
    description: 'Danh sách ảnh riêng của biến thể này',
  })
  images: string[];
}

export class ProductResponseDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440004',
    description: 'ID sản phẩm',
  })
  id: string;

  @ApiProperty({
    type: () => ShopResponseDto,
    description: 'Thông tin gian hàng bán sản phẩm',
    required: false,
  })
  shop?: ShopResponseDto;

  @ApiProperty({ example: 'Áo sơ mi lụa tơ tằm', description: 'Tên sản phẩm' })
  name: string;

  @ApiProperty({
    example: 'ao-so-mi-lua-to-tam',
    description: 'Slug sản phẩm dùng cho SEO',
  })
  slug: string;

  @ApiProperty({
    example: 'SKU-SILK-SHIRT',
    description: 'Mã định danh kho hàng sản phẩm gốc',
    nullable: true,
  })
  sku: string | null;

  @ApiProperty({
    example: 'Mô tả chi tiết áo sơ mi sang trọng',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    example: 250000.0,
    description: 'Giá bán cơ bản của sản phẩm',
  })
  price: number;

  @ApiProperty({ example: 200, description: 'Trọng lượng sản phẩm (gram)' })
  weight: number;

  @ApiProperty({
    example: 30,
    nullable: true,
    description: 'Chiều dài hộp đóng gói (cm)',
  })
  length: number | null;

  @ApiProperty({
    example: 20,
    nullable: true,
    description: 'Chiều rộng hộp đóng gói (cm)',
  })
  width: number | null;

  @ApiProperty({
    example: 5,
    nullable: true,
    description: 'Chiều cao hộp đóng gói (cm)',
  })
  height: number | null;

  @ApiProperty({
    type: () => CategoryResponseDto,
    description: 'Danh mục chứa sản phẩm',
    required: false,
  })
  category?: CategoryResponseDto;

  @ApiProperty({
    type: () => [ProductVariantResponseDto],
    description: 'Danh sách biến thể của sản phẩm',
  })
  variants: ProductVariantResponseDto[];

  @ApiProperty({
    example:
      'https://res.cloudinary.com/cloudinary-name/image/upload/v12345/products/thumbnails/thumb.jpg',
    nullable: true,
    description: 'Đường dẫn ảnh đại diện sản phẩm',
  })
  thumbnail_url: string | null;

  @ApiProperty({
    example: [
      'https://res.cloudinary.com/cloudinary-name/image/upload/v12345/products/gallery/gallery1.jpg',
    ],
    nullable: true,
    description: 'Bộ sưu tập ảnh chi tiết sản phẩm',
  })
  gallery: string[] | null;

  @ApiProperty({
    example: [
      'https://res.cloudinary.com/cloudinary-name/image/upload/v12345/products/thumbnails/thumb.jpg',
      'https://res.cloudinary.com/cloudinary-name/image/upload/v12345/products/gallery/gallery1.jpg',
    ],
    description: 'Ảnh tổng hợp gồm thumbnail + gallery',
  })
  aggregated_gallery?: string[];

  @ApiProperty({
    example: 150,
    description:
      'Tổng số lượng tồn kho của tất cả biến thể hoặc của chính sản phẩm gốc',
  })
  stock_quantity: number;

  @ApiProperty({
    example: true,
    description:
      'Đánh dấu sản phẩm có nhiều biến thể (màu sắc, kích thước) hay không',
  })
  has_variants: boolean;

  @ApiProperty({
    example: false,
    description: 'Đánh dấu sản phẩm bị ẩn khỏi khách hàng hay không',
  })
  is_hidden: boolean;

  @ApiProperty({
    example: false,
    description: 'Đánh dấu sản phẩm nổi bật hay không',
  })
  is_featured: boolean;

  @ApiProperty({
    enum: ProductStatus,
    example: ProductStatus.ACTIVE,
    description: 'Trạng thái hoạt động sản phẩm',
  })
  status: ProductStatus;

  @ApiProperty({ example: '2024-03-20T10:00:00Z' })
  created_at: Date;

  @ApiProperty({ example: '2024-03-20T11:00:00Z' })
  updated_at: Date;
}
