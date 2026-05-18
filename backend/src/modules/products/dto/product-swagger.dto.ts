import { ApiProperty } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';

export class CreateProductSwaggerDto extends CreateProductDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Ảnh đại diện (Thumbnail) của sản phẩm (1 file)',
    required: true,
  })
  thumbnail: any;

  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Ảnh bộ sưu tập (Gallery) của sản phẩm (tối đa 5 files)',
    required: false,
  })
  general_gallery?: any[];

  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Danh sách các ảnh phục vụ cho các biến thể sản phẩm (tối đa 30 files)',
    required: false,
  })
  variant_images?: any[];
}

export class UpdateProductSwaggerDto extends UpdateProductDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Cập nhật ảnh đại diện mới (1 file)',
    required: false,
  })
  thumbnail?: any;

  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Thêm ảnh mới vào bộ sưu tập sản phẩm (tối đa 5 files)',
    required: false,
  })
  general_gallery?: any[];

  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Cập nhật thêm ảnh phục vụ các biến thể sản phẩm (tối đa 30 files)',
    required: false,
  })
  variant_images?: any[];
}
