import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RejectPayoutDto {
  @ApiProperty({ description: 'Lý do từ chối yêu cầu rút tiền', example: 'Thông tin tài khoản ngân hàng sai' })
  @IsString({ message: 'Lý do từ chối phải là chuỗi.' })
  @IsNotEmpty({ message: 'Lý do từ chối không được để trống.' })
  reason: string;
}
