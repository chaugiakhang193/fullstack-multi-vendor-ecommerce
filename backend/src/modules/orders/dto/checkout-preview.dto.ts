import {
  IsUUID,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ShopCouponDto } from '@/modules/orders/dto/create-order.dto';
import { ORDER_LIMITS } from '@/common/limits';

// Input cho POST /orders/checkout/preview — không cần payment_method (chỉ ước tính).
export class CheckoutPreviewDto {
  @ApiProperty({ description: 'ID địa chỉ giao hàng (thuộc sổ địa chỉ user)' })
  @IsUUID()
  address_id: string;

  @ApiPropertyOptional({ description: 'Mã giảm giá toàn sàn (GLOBAL)' })
  @IsOptional()
  @IsString()
  global_coupon_code?: string;

  @ApiPropertyOptional({
    description: 'Mã giảm giá theo từng Shop',
    type: [ShopCouponDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ORDER_LIMITS.MAX_SHOP_COUPONS)
  @ValidateNested({ each: true })
  @Type(() => ShopCouponDto)
  shop_coupons?: ShopCouponDto[];
}
