import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'Họ và tên hiển thị', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Họ tên không được vượt quá 50 ký tự' })
  full_name?: string;

  @ApiPropertyOptional({ description: 'Số điện thoại (để trống để xóa)' })
  @IsOptional()
  @IsString()
  // Cho phép chuỗi rỗng (xóa SĐT) hoặc số VN hợp lệ
  @Matches(/^$|^(0|\+84)[0-9]{9,10}$/, {
    message: 'Số điện thoại không hợp lệ',
  })
  phone?: string;
}
