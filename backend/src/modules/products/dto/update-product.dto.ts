import { PartialType, OmitType } from '@nestjs/swagger';
import {
  CreateProductDto,
  CreateProductVariantDto,
} from '@/modules/products/dto/create-product.dto';
import { Type, Transform, plainToInstance } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  IsString,
  Min,
  Max,
  ArrayMaxSize,
  IsEnum,
  IsBoolean,
  Matches,
} from 'class-validator';
import { ProductStatus } from '@/common/enums';
import { UPLOAD_LIMITS } from '@/common/constants/upload.constant';

export class UpdateProductVariantDto extends PartialType(
  CreateProductVariantDto,
) {
  @ApiProperty({
    required: false,
    description: 'ID của biến thể (nếu là cập nhật)',
  })
  @IsOptional()
  @IsUUID('all', { message: 'ID biến thể không hợp lệ' })
  id?: string;

  @ApiProperty({
    required: false,
    description: 'Danh sách URL ảnh cũ giữ lại',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  existingImages?: string[];

  @ApiProperty({
    required: false,
    description: 'Số lượng ảnh mới sẽ upload',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(UPLOAD_LIMITS.PRODUCT.MAX_VARIANT_IMAGES, {
    message: `Mỗi biến thể chỉ được phép tải lên tối đa ${UPLOAD_LIMITS.PRODUCT.MAX_VARIANT_IMAGES} ảnh mới`,
  })
  imageCount?: number;
}

export class UpdateColorImageGroupDto {
  @ApiProperty({ example: 'Đỏ' })
  @IsString()
  color: string;

  @ApiProperty({
    example: '#ef4444',
    required: false,
    description: 'Mã màu hex (optional) — dùng cho chấm màu',
  })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Mã màu phải dạng #RRGGBB' })
  hex?: string;

  @ApiProperty({
    required: false,
    type: [String],
    description: 'URL ảnh màu cũ giữ lại',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  existingImages?: string[];

  @ApiProperty({
    required: false,
    default: 0,
    description: 'Số ảnh mới upload cho màu',
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(UPLOAD_LIMITS.PRODUCT.MAX_VARIANT_IMAGES)
  imageCount?: number;
}

export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['variants', 'colorImages'] as const),
) {
  @ApiProperty({
    required: false,
    enum: ProductStatus,
    description: 'Trạng thái hoạt động của sản phẩm',
  })
  @IsOptional()
  @IsEnum(ProductStatus, { message: 'Trạng thái sản phẩm không hợp lệ' })
  status?: ProductStatus;

  @ApiProperty({
    required: false,
    description: 'Ẩn/hiện sản phẩm với khách hàng',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'Trạng thái ẩn phải là giá trị boolean' })
  is_hidden?: boolean;

  @ApiProperty({
    type: [UpdateProductVariantDto],
    description: 'Danh sách các biến thể của sản phẩm (JSON String)',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return plainToInstance(UpdateProductVariantDto, parsed);
      } catch (e) {
        return value;
      }
    }
    return value;
  })
  @IsArray({ message: 'Danh sách biến thể phải là một mảng' })
  @ArrayMaxSize(30, { message: 'Sản phẩm chỉ được phép có tối đa 30 biến thể' })
  @ValidateNested({ each: true })
  @Type(() => UpdateProductVariantDto)
  variants?: UpdateProductVariantDto[];

  @ApiProperty({
    type: [UpdateColorImageGroupDto],
    required: false,
    description: 'Nhóm ảnh theo màu (JSON String)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return plainToInstance(UpdateColorImageGroupDto, JSON.parse(value));
      } catch (e) {
        return value;
      }
    }
    return value;
  })
  @IsArray()
  @ArrayMaxSize(30, { message: 'Tối đa 30 nhóm màu' })
  @ValidateNested({ each: true })
  @Type(() => UpdateColorImageGroupDto)
  colorImages?: UpdateColorImageGroupDto[];

  @ApiProperty({
    required: false,
    description: 'Danh sách URL ảnh phụ cũ giữ lại',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '') return [];
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (e) {
        return [value];
      }
    }
    return Array.isArray(value) ? value : [value];
  })
  @IsArray()
  @IsString({ each: true })
  existingGalleryImages?: string[];
}
