import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAddressDto {
  @ApiProperty({
    example: '123 Đường ABC, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    description: 'Địa chỉ chi tiết của người nhận',
  })
  @IsNotEmpty({ message: 'Địa chỉ không được để trống' })
  @IsString({ message: 'Địa chỉ phải là chuỗi ký tự' })
  address_line: string;

  @ApiPropertyOptional({
    example: '10.7769',
    description: 'Vĩ độ của địa chỉ',
  })
  @IsOptional()
  @IsString({ message: 'Vĩ độ phải là chuỗi ký tự' })
  lat?: string;

  @ApiPropertyOptional({
    example: '106.7009',
    description: 'Kinh độ của địa chỉ',
  })
  @IsOptional()
  @IsString({ message: 'Kinh độ phải là chuỗi ký tự' })
  lng?: string;

  @ApiProperty({
    example: 'Nguyễn Văn A',
    description: 'Tên người nhận hàng',
  })
  @IsNotEmpty({ message: 'Tên người nhận không được để trống' })
  @IsString({ message: 'Tên người nhận phải là chuỗi ký tự' })
  recipient_name: string;

  @ApiProperty({
    example: '0901234567',
    description: 'Số điện thoại liên hệ của người nhận (chuẩn Việt Nam)',
  })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  @Matches(/^(0\d{9}|\+84\d{9})$/, {
    message: 'Số điện thoại phải là số điện thoại Việt Nam hợp lệ (10 số bắt đầu bằng 0, hoặc bắt đầu bằng +84 và 9 chữ số)',
  })
  phone: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Đặt làm địa chỉ mặc định',
  })
  @IsOptional()
  @IsBoolean({ message: 'Trạng thái mặc định phải là giá trị boolean' })
  is_default?: boolean;
}
