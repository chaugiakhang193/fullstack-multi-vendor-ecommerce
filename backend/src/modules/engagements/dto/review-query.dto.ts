import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

export class ReviewQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Lọc review theo số sao chính xác (1-5). Bỏ trống = tất cả.',
    type: Number,
  })
  @IsOptional()
  @Transform(({ value }) => {
    const val = Number(value);
    return isNaN(val) ? undefined : val;
  })
  @IsInt({ message: 'Số sao phải là số nguyên' })
  @Min(1, { message: 'Số sao tối thiểu là 1' })
  @Max(5, { message: 'Số sao tối đa là 5' })
  rating?: number;
}
