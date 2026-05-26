import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, Min, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

export class GetProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Từ khóa tìm kiếm (theo tên hoặc mô tả sản phẩm)',
    type: String,
  })
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự' })
  q?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo ID danh mục',
    type: String,
  })
  @IsOptional()
  @IsUUID('all', { message: 'ID danh mục phải là UUID hợp lệ' })
  category_id?: string;

  @ApiPropertyOptional({
    description: 'Giá tối thiểu',
    type: Number,
  })
  @IsOptional()
  @Transform(({ value }) => {
    const val = Number(value);
    return isNaN(val) ? undefined : val;
  })
  @IsNumber({}, { message: 'Giá tối thiểu phải là số' })
  @Min(0, { message: 'Giá tối thiểu phải lớn hơn hoặc bằng 0' })
  min_price?: number;

  @ApiPropertyOptional({
    description: 'Giá tối đa',
    type: Number,
  })
  @IsOptional()
  @Transform(({ value }) => {
    const val = Number(value);
    return isNaN(val) ? undefined : val;
  })
  @IsNumber({}, { message: 'Giá tối đa phải là số' })
  @Min(0, { message: 'Giá tối đa phải lớn hơn hoặc bằng 0' })
  max_price?: number;
}

export class GetSellerProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Từ khóa tìm kiếm theo tên, SKU gốc hoặc SKU biến thể con',
    type: String,
  })
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự' })
  q?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái ẩn/hiện của sản phẩm (true: ẩn, false: hiện)',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    return value === 'true' || value === true || value === '1';
  })
  is_hidden?: boolean;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái tồn kho (in_stock: còn hàng, out_of_stock: hết hàng, all: tất cả)',
    enum: ['all', 'in_stock', 'out_of_stock'],
  })
  @IsOptional()
  @IsString()
  stock_status?: 'all' | 'in_stock' | 'out_of_stock';
}
