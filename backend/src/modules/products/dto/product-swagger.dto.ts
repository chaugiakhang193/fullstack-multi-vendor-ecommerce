import { ApiProperty } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';
import { UPLOAD_LIMITS } from '@/common/constants/upload.constant';

export class CreateProductSwaggerDto extends CreateProductDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: `Ảnh đại diện (Thumbnail) của sản phẩm (${UPLOAD_LIMITS.PRODUCT.MAX_THUMBNAILS} file)`,
    required: true,
  })
  thumbnail: any;

  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: `Ảnh bộ sưu tập (Gallery) của sản phẩm (tối đa ${UPLOAD_LIMITS.PRODUCT.MAX_GALLERY_IMAGES} files)`,
    required: false,
  })
  general_gallery?: any[];

  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: `Danh sách các ảnh phục vụ cho các biến thể sản phẩm (tối đa ${UPLOAD_LIMITS.PRODUCT.MAX_VARIANT_FILES_BATCH} files)`,
    required: false,
  })
  variant_images?: any[];
}

export class UpdateProductSwaggerDto extends UpdateProductDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: `Cập nhật ảnh đại diện mới (${UPLOAD_LIMITS.PRODUCT.MAX_THUMBNAILS} file)`,
    required: false,
  })
  thumbnail?: any;

  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: `Thêm ảnh mới vào bộ sưu tập sản phẩm (tối đa ${UPLOAD_LIMITS.PRODUCT.MAX_GALLERY_IMAGES} files)`,
    required: false,
  })
  general_gallery?: any[];

  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: `Cập nhật thêm ảnh phục vụ các biến thể sản phẩm (tối đa ${UPLOAD_LIMITS.PRODUCT.MAX_VARIANT_FILES_BATCH} files)`,
    required: false,
  })
  variant_images?: any[];
}
