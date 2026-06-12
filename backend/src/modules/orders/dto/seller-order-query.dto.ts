import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { OrderStatus } from '@/common/enums';

export class SellerOrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo trạng thái sub-order', enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus, { message: 'Trạng thái không hợp lệ' })
  status?: OrderStatus;
}
