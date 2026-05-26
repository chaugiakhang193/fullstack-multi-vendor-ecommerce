import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsUUID,
  Min,
  Max,
  ArrayMaxSize,
} from 'class-validator';
import { Type, Transform, plainToInstance } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { UPLOAD_LIMITS } from '@/common/constants/upload.constant';

export class CreateProductVariantDto {
  @ApiProperty({
    example: 'Màu Đỏ, Size L',
    description: 'Tên biến thể (màu sắc, kích cỡ...)',
  })
  @IsNotEmpty({ message: 'Tên biến thể không được để trống' })
  @IsString({ message: 'Tên biến thể phải là chuỗi ký tự' })
  name: string;

  @ApiProperty({ example: 10000, description: 'Giá cộng thêm so với giá gốc' })
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : value))
  @IsNumber({}, { message: 'Giá cộng thêm phải là một số' })
  @Min(0, { message: 'Giá cộng thêm không được nhỏ hơn 0' })
  additional_price?: number;

  @ApiProperty({ example: 'SKU-RED-L', description: 'Mã SKU của biến thể' })
  @IsOptional()
  @IsString({ message: 'Mã SKU phải là chuỗi ký tự' })
  sku?: string;

  @ApiProperty({
    example: 50,
    description: 'Số lượng tồn kho của biến thể này',
  })
  @IsNotEmpty({ message: 'Số lượng tồn kho không được để trống' })
  @Transform(({ value }) => (value ? Number(value) : value))
  @IsNumber({}, { message: 'Số lượng tồn kho phải là một số' })
  @Min(0, { message: 'Số lượng tồn kho không được nhỏ hơn 0' })
  stock_quantity: number;

  @ApiProperty({ example: 1, description: 'Số lượng ảnh của biến thể này' })
  @IsNotEmpty({ message: 'Số lượng ảnh không được để trống' })
  @Transform(({ value }) => (value ? Number(value) : value))
  @IsNumber({}, { message: 'Số lượng ảnh phải là một số' })
  @Min(1, { message: 'Mỗi biến thể phải có ít nhất 1 ảnh' })
  @Max(UPLOAD_LIMITS.PRODUCT.MAX_VARIANT_IMAGES, { message: `Mỗi biến thể chỉ được phép có tối đa ${UPLOAD_LIMITS.PRODUCT.MAX_VARIANT_IMAGES} hình ảnh` })
  imageCount: number;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Áo thun Nam', description: 'Tên sản phẩm' })
  @IsNotEmpty({ message: 'Tên sản phẩm không được để trống' })
  @IsString({ message: 'Tên sản phẩm phải là chuỗi ký tự' })
  name: string;

  @ApiProperty({
    example: 'Áo thun cotton 100% cao cấp',
    description: 'Mô tả sản phẩm',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Mô tả sản phẩm phải là chuỗi ký tự' })
  description?: string;

  @ApiProperty({ example: 150000, description: 'Giá sản phẩm' })
  @IsNotEmpty({ message: 'Giá sản phẩm không được để trống' })
  @Transform(({ value }) => (value ? Number(value) : value))
  @IsNumber({}, { message: 'Giá sản phẩm phải là một số' })
  @Min(0, { message: 'Giá sản phẩm không được nhỏ hơn 0' })
  price: number;

  @ApiProperty({ example: 'SKU-001', description: 'Mã SKU sản phẩm' })
  @IsOptional()
  @IsString({ message: 'Mã SKU phải là chuỗi ký tự' })
  sku?: string;

  @ApiProperty({ example: 500, description: 'Trọng lượng (gram)' })
  @IsNotEmpty({ message: 'Trọng lượng không được để trống' })
  @Transform(({ value }) => (value ? Number(value) : value))
  @IsNumber({}, { message: 'Trọng lượng phải là một số' })
  @Min(1, { message: 'Trọng lượng phải lớn hơn 0' })
  weight: number;

  @ApiProperty({ example: 10, description: 'Chiều dài (cm)', required: false })
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : value))
  @IsNumber({}, { message: 'Chiều dài phải là một số' })
  @Min(1, { message: 'Chiều dài phải lớn hơn 0' })
  length?: number;

  @ApiProperty({ example: 10, description: 'Chiều rộng (cm)', required: false })
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : value))
  @IsNumber({}, { message: 'Chiều rộng phải là một số' })
  @Min(1, { message: 'Chiều rộng phải lớn hơn 0' })
  width?: number;

  @ApiProperty({ example: 10, description: 'Chiều cao (cm)', required: false })
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : value))
  @IsNumber({}, { message: 'Chiều cao phải là một số' })
  @Min(1, { message: 'Chiều cao phải lớn hơn 0' })
  height?: number;

  @ApiProperty({ example: 'uuid-category', description: 'ID danh mục' })
  @IsNotEmpty({ message: 'Danh mục không được để trống' })
  @IsUUID('all', { message: 'ID danh mục không đúng định dạng UUID' })
  category_id: string;

  @ApiProperty({
    example: 100,
    description: 'Số lượng tồn kho (Dùng cho sản phẩm không có biến thể)',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : value))
  @IsNumber({}, { message: 'Số lượng tồn kho phải là một số' })
  @Min(0, { message: 'Số lượng tồn kho không được nhỏ hơn 0' })
  stock_quantity?: number;

  @ApiProperty({
    example: false,
    description: 'Sản phẩm có biến thể hay không?',
  })
  @IsNotEmpty({ message: 'Trạng thái biến thể không được để trống' })
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  has_variants: boolean;

  @ApiProperty({
    type: [CreateProductVariantDto],
    description: 'Danh sách các biến thể của sản phẩm (JSON String)',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return plainToInstance(CreateProductVariantDto, parsed);
      } catch (e) {
        return value;
      }
    }
    return value;
  })
  @IsArray({ message: 'Danh sách biến thể phải là một mảng' })
  @ArrayMaxSize(30, { message: 'Sản phẩm chỉ được phép có tối đa 30 biến thể' })
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants?: CreateProductVariantDto[];
}
