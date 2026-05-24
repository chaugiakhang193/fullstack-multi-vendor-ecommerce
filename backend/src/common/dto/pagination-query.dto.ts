import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, IsString, IsIn, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Số trang hiện tại (bắt đầu từ 1)',
    default: 1,
    type: Number,
  })
  @IsOptional()
  @Transform(({ value }) => {
    const val = Number(value);
    const defaultValue = 1;
    const isValNaN = isNaN(val);
    const result = isValNaN ? defaultValue : val;
    return result;
  })
  @IsInt({ message: 'Trang phải là số nguyên' })
  @Min(1, { message: 'Trang phải lớn hơn hoặc bằng 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Số lượng phần tử trên mỗi trang',
    default: 10,
    type: Number,
  })
  @IsOptional()
  @Transform(({ value }) => {
    const val = Number(value);
    const defaultLimit = 10;
    const maxLimit = 100;
    const isValNaN = isNaN(val);
    if (isValNaN) {
      return defaultLimit;
    }
    const valNumber = val;
    const maxLimitNumber = maxLimit;
    const finalLimit = Math.min(valNumber, maxLimitNumber);
    return finalLimit;
  })
  @IsInt({ message: 'Giới hạn phải là số nguyên' })
  @Min(1, { message: 'Giới hạn phải lớn hơn hoặc bằng 1' })
  @Max(100, { message: 'Giới hạn tối đa là 100 phần tử trên mỗi trang' })
  limit?: number = 10;

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
