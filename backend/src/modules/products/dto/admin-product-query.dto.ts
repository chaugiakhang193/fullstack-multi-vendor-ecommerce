import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsUUID, IsString } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { ProductStatus } from '@/common/enums';

export class AdminProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên sản phẩm.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    enum: ProductStatus,
    description: 'Lọc theo trạng thái.',
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ description: 'Lọc theo shop.' })
  @IsOptional()
  @IsUUID()
  shop_id?: string;
}
