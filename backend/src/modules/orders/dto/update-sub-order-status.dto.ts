import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { OrderStatus } from '@/common/enums';

export class UpdateSubOrderStatusDto {
  @ApiProperty({ description: 'Trạng thái mới của sub-order', enum: OrderStatus })
  @IsEnum(OrderStatus, { message: 'Trạng thái không hợp lệ' })
  status: OrderStatus;
}
