import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateShopDto } from '@/modules/shops/dto/create-shop.dto';

export class SetupShopSwaggerDto extends CreateShopDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Ảnh logo của shop (1 file)',
  })
  logo: any;

  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Ảnh banner của shop (1 file)',
  })
  banner: any;

  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Mảng các ảnh gallery (1-3 files)',
  })
  gallery: any[];
}

export class UpdateShopSwaggerDto extends PartialType(CreateShopDto) {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Cập nhật logo mới',
    required: false,
  })
  logo?: any;

  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Cập nhật banner mới',
    required: false,
  })
  banner?: any;

  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Thêm ảnh vào bộ sưu tập',
    required: false,
  })
  gallery?: any[];
}

export class UploadSingleFileSwaggerDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'File ảnh cần upload',
  })
  file: any;
}

export class UploadMultipleFilesSwaggerDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Danh sách các file ảnh (tối đa 3)',
  })
  files: any[];
}
