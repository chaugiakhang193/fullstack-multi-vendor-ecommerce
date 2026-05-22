import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsNumber,
  ValidateIf,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    example: 'Thời trang nam',
    description: 'Tên hiển thị của danh mục',
  })
  @IsNotEmpty({ message: 'Tên danh mục không được để trống' })
  @IsString({ message: 'Tên danh mục phải là chuỗi ký tự' })
  name: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID của danh mục cha. Để trống nếu là danh mục gốc.',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((object, value) => value !== null)
  @IsUUID('all', { message: 'ID danh mục cha không đúng định dạng' })
  parentId?: string | null;

  @ApiProperty({
    example: 1,
    description: 'Thứ tự ưu tiên hiển thị (số càng nhỏ càng hiện trước)',
    required: false,
    default: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Thứ tự hiển thị phải là số' })
  display_order?: number;
}
