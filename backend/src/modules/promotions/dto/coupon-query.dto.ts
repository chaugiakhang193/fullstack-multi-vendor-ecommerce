import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { CouponType } from '@/common/enums';

export class CouponQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CouponType, description: 'Lọc theo loại (admin list)' })
  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;
}
