import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  MinLength,
  ArrayNotEmpty,
  IsUrl,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Transform, Type, plainToInstance } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class BankAccountInfoDto {
  @ApiProperty({ example: 'Vietcombank', description: 'Tên ngân hàng' })
  @IsNotEmpty({ message: 'Tên ngân hàng không được để trống' })
  @IsString({ message: 'Tên ngân hàng phải là chuỗi ký tự' })
  bank_name: string;

  @ApiProperty({ example: '123456789', description: 'Số tài khoản' })
  @IsNotEmpty({ message: 'Số tài khoản không được để trống' })
  @IsString({ message: 'Số tài khoản phải là chuỗi ký tự' })
  account_number: string;

  @ApiProperty({ example: 'NGUYEN VAN A', description: 'Tên chủ tài khoản' })
  @IsNotEmpty({ message: 'Tên chủ tài khoản không được để trống' })
  @IsString({ message: 'Tên chủ tài khoản phải là chuỗi ký tự' })
  account_holder: string;
}

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
    example: 10.7769,
    description: 'Vĩ độ (frontend điền sau khi chọn autocomplete)',
    nullable: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseFloat(value) : null,
  )
  @IsNumber({}, { message: 'Vĩ độ phải là số hợp lệ' })
  lat?: number | null;

  @ApiProperty({
    example: 106.6978,
    description: 'Kinh độ (frontend điền sau khi chọn autocomplete)',
    nullable: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseFloat(value) : null,
  )
  @IsNumber({}, { message: 'Kinh độ phải là số hợp lệ' })
  lng?: number | null;

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

  @ApiProperty({ type: BankAccountInfoDto, description: 'Thông tin tài khoản ngân hàng' })
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    try {
      const parsedObj = JSON.parse(value);
      const instance = plainToInstance(BankAccountInfoDto, parsedObj);
      return instance;
    } catch {
      return value;
    }
  })
  @IsNotEmpty({ message: 'Thông tin ngân hàng không được để trống' })
  @ValidateNested()
  @Type(() => BankAccountInfoDto)
  bank_account_info: BankAccountInfoDto;

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
