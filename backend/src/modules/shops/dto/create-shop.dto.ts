import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  MinLength,
  ArrayNotEmpty,
  IsUrl,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateShopDto {
  @ApiProperty({
    example: 'Cửa hàng quần áo ABC',
    description: 'Tên gian hàng',
  })
  @IsNotEmpty({ message: 'Tên gian hàng không được để trống' })
  @IsString({ message: 'Tên gian hàng phải là chuỗi ký tự' })
  @MinLength(3, { message: 'Tên gian hàng phải có ít nhất 3 ký tự' })
  name: string;

  @ApiProperty({
    example: 'Chuyên cung cấp quần áo nam nữ chất lượng cao',
    description: 'Mô tả về gian hàng',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự' })
  description?: string;

  @ApiProperty({
    example: 'Số 1, đường ABC, Quận 1, TP.HCM',
    description: 'Địa chỉ lấy hàng (kho)',
  })
  @IsNotEmpty({ message: 'Địa chỉ lấy hàng không được để trống' })
  @IsString({ message: 'Địa chỉ phải là chuỗi ký tự' })
  pickup_address: string;

  @ApiProperty({
    example: 'https://cloudinary.com/logo.png',
    description: 'URL ảnh logo của shop',
    required: false,
  })
  @IsOptional()
  @IsUrl({}, { message: 'Logo URL phải là định dạng URL hợp lệ' })
  logo_url?: string;

  @ApiProperty({
    example: 'https://cloudinary.com/banner.png',
    description: 'URL ảnh banner của shop',
    required: false,
  })
  @IsOptional()
  @IsUrl({}, { message: 'Banner URL phải là định dạng URL hợp lệ' })
  banner_url?: string;

  @ApiProperty({
    example: 'VCB - 123456789 - NGUYEN VAN A',
    description: 'Thông tin tài khoản ngân hàng',
  })
  @IsNotEmpty({ message: 'Thông tin ngân hàng không được để trống' })
  @IsString({ message: 'Thông tin ngân hàng phải là chuỗi ký tự' })
  bank_account_info: string;

  @ApiProperty({
    example: ['uuid-category-1', 'uuid-category-2'],
    description: 'Danh sách các ID danh mục mà shop kinh doanh',
    type: [String],
  })
  @IsNotEmpty({ message: 'Vui lòng chọn ít nhất 1 danh mục kinh doanh' })
  @IsArray({ message: 'Danh mục phải là một mảng các ID' })
  @IsUUID('all', {
    each: true,
    message: 'ID danh mục không đúng định dạng UUID',
  })
  categoryIds: string[];
}
