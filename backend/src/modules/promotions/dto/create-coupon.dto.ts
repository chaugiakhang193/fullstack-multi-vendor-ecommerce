import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsEnum, IsOptional, IsNumber, Min, IsInt, IsDateString,
} from 'class-validator';
import { DiscountType } from '@/common/enums';

export class CreateCouponDto {
  @ApiProperty({ example: 'SALE50' })
  @IsString()
  code: string;

  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  discount_type: DiscountType;

  @ApiProperty({ example: 50000, description: 'percentage: %, fixed_amount: VND' })
  @IsNumber()
  @Min(0)
  discount_value: number;

  @ApiPropertyOptional({ example: 200000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  min_order_value?: number;

  @ApiPropertyOptional({ example: 100000, description: 'Trần giảm cho percentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  max_discount_value?: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ example: 100, description: 'Tổng lượt dùng; null = không giới hạn' })
  @IsOptional()
  @IsInt()
  @Min(1)
  usage_limit?: number;
}
