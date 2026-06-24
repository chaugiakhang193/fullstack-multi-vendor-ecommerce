import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsEnum, IsOptional, IsNumber, Min, IsInt, IsDateString, Length,
} from 'class-validator';
import { DiscountType } from '@/common/enums';
import { COUPON_LIMITS } from '@/common/limits';

export class CreateCouponDto {
  @ApiProperty({ example: 'SALE50' })
  @IsString()
  @Length(COUPON_LIMITS.CODE_MIN_LENGTH, COUPON_LIMITS.CODE_MAX_LENGTH, {
    message: `Mã coupon phải từ ${COUPON_LIMITS.CODE_MIN_LENGTH} đến ${COUPON_LIMITS.CODE_MAX_LENGTH} ký tự`,
  })
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
