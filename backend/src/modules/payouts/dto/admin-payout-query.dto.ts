import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { PayoutStatus } from '@/common/enums';

export class AdminPayoutQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: PayoutStatus,
    description: 'Lọc danh sách theo trạng thái payout',
  })
  @IsOptional()
  @IsEnum(PayoutStatus, { message: 'Trạng thái payout không hợp lệ' })
  status?: PayoutStatus;
}
