import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateVnpayUrlDto {
  @ApiProperty({
    description: 'ID đơn hàng (Master Order) cần tạo URL thanh toán VNPay',
    example: 'd1b85fb4-3449-45cf-a407-d26b808a55b8',
  })
  @IsUUID()
  orderId: string;
}
