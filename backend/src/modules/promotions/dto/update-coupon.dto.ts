import { PartialType } from '@nestjs/swagger';
import { CreateCouponDto } from '@/modules/promotions/dto/create-coupon.dto';

// code không cho sửa (đã phát hành) → omit ở service, hoặc giữ PartialType và bỏ qua code khi update.
export class UpdateCouponDto extends PartialType(CreateCouponDto) {}
