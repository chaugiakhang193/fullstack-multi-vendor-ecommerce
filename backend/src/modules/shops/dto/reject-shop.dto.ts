import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RejectShopDto {
  @ApiProperty({
    example: 'Hồ sơ thiếu hình ảnh bộ sưu tập hoặc logo mờ.',
    description: 'Lý do từ chối phê duyệt gian hàng',
  })
  @IsNotEmpty({ message: 'Lý do từ chối không được để trống' })
  @IsString({ message: 'Lý do từ chối phải là chuỗi ký tự' })
  @MinLength(5, { message: 'Lý do từ chối phải có ít nhất 5 ký tự' })
  reason: string;
}
