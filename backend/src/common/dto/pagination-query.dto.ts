import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, IsString, IsIn, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { PAGINATION_LIMITS } from '../constants/pagination.constant';

export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Số trang hiện tại (bắt đầu từ 1)',
    default: PAGINATION_LIMITS.DEFAULT_PAGE,
    type: Number,
  })
  @IsOptional()
  @Transform(({ value }) => {
    const val = Number(value);
    if (isNaN(val) || val < PAGINATION_LIMITS.DEFAULT_PAGE) {
      return PAGINATION_LIMITS.DEFAULT_PAGE;
    }
    return val;
  })
  @IsInt({ message: 'Trang phải là số nguyên' })
  @Min(PAGINATION_LIMITS.DEFAULT_PAGE, { message: 'Trang phải lớn hơn hoặc bằng 1' })
  page?: number = PAGINATION_LIMITS.DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: 'Số lượng phần tử trên mỗi trang',
    default: PAGINATION_LIMITS.DEFAULT_LIMIT,
    type: Number,
  })
  @IsOptional()
  @Transform(({ value }) => {
    const val = Number(value);
    if (isNaN(val) || val < PAGINATION_LIMITS.DEFAULT_PAGE) {
      return PAGINATION_LIMITS.DEFAULT_LIMIT;
    }
    return Math.min(val, PAGINATION_LIMITS.MAX_LIMIT);
  })
  @IsInt({ message: 'Giới hạn phải là số nguyên' })
  @Min(PAGINATION_LIMITS.DEFAULT_PAGE, { message: 'Giới hạn phải lớn hơn hoặc bằng 1' })
  @Max(PAGINATION_LIMITS.MAX_LIMIT, { message: 'Giới hạn tối đa là 100 phần tử trên mỗi trang' })
  limit?: number = PAGINATION_LIMITS.DEFAULT_LIMIT;

  @ApiPropertyOptional({
    description: 'Trường sắp xếp (ví dụ: price, created_at, name)',
    type: String,
  })
  @IsOptional()
  @IsString({ message: 'Trường sắp xếp phải là chuỗi ký tự' })
  sort?: string;

  @ApiPropertyOptional({
    description: 'Chiều sắp xếp (ASC hoặc DESC)',
    enum: ['ASC', 'DESC'],
    default: 'DESC',
  })
  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsIn(['ASC', 'DESC'], { message: 'Chiều sắp xếp phải là ASC hoặc DESC' })
  order?: 'ASC' | 'DESC' = 'DESC';
}
