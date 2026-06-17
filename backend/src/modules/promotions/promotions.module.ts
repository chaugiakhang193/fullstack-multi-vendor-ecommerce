import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromotionsService } from '@/modules/promotions/promotions.service';
import { AdminCouponsController } from '@/modules/promotions/admin-coupons.controller';
import { SellerCouponsController } from '@/modules/promotions/seller-coupons.controller';
import { CustomerCouponsController } from '@/modules/promotions/customer-coupons.controller';
import { Coupon } from '@/modules/promotions/entities/coupon.entity';
import { UserCoupon } from '@/modules/promotions/entities/user-coupon.entity';
import { ShopsModule } from '@/modules/shops/shops.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Coupon, UserCoupon]),
    ShopsModule,
  ],
  controllers: [AdminCouponsController, SellerCouponsController, CustomerCouponsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
