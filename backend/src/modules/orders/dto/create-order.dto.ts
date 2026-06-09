import {
  IsUUID,
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Enums
import { PaymentMethod } from '@/common/enums';

/**
 * ShopCouponDto — Mã giảm giá áp dụng theo từng Shop.
 *
 * Chọn cấu trúc object {shop_id, coupon_code} (Phương án B) thay vì mảng chuỗi
 * để map 1:1 với sub_order và chặn được tình huống áp mã của shop A cho shop B.
 */
export class ShopCouponDto {
  @ApiProperty({
    description: 'ID của Shop áp dụng mã giảm giá',
    example: 'd1b85fb4-3449-45cf-a407-d26b808a55b8',
  })
  @IsUUID()
  shop_id: string;

  @ApiProperty({
    description: 'Mã giảm giá của Shop tương ứng',
    example: 'SHOP-SUMMER10',
  })
  @IsString()
  coupon_code: string;
}

/**
 * CreateOrderDto — Payload đầu vào của POST /orders/checkout.
 *
 * Lưu ý kiến trúc:
 *  - Idempotency-Key KHÔNG nằm trong DTO. Theo chuẩn API thiết kế tốt,
 *    khoá đó được truyền qua HTTP Header (`Idempotency-Key`) để tách hạ tầng
 *    khỏi payload nghiệp vụ.
 *  - Không nhận giá / phí ship / tổng tiền từ client. Toàn bộ con số được
 *    tính lại từ DB ở backend (server-side recalculation) để chống thao túng.
 */
export class CreateOrderDto {
  @ApiProperty({
    description: 'ID của địa chỉ giao hàng — phải thuộc sổ địa chỉ của user',
    example: 'd1b85fb4-3449-45cf-a407-d26b808a55b8',
  })
  @IsUUID()
  address_id: string;

  @ApiProperty({
    description: 'Phương thức thanh toán (hiện chỉ hỗ trợ COD)',
    enum: PaymentMethod,
    example: PaymentMethod.COD,
  })
  @IsEnum(PaymentMethod, {
    message: 'Phương thức thanh toán không hợp lệ',
  })
  payment_method: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Mã giảm giá toàn sàn (loại GLOBAL). Để trống nếu không dùng.',
    example: 'WELCOME50K',
  })
  @IsOptional()
  @IsString()
  global_coupon_code?: string;

  @ApiPropertyOptional({
    description: 'Danh sách mã giảm giá theo từng Shop (loại SHOP).',
    type: [ShopCouponDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShopCouponDto)
  shop_coupons?: ShopCouponDto[];
}
