import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PromotionsService } from '@/modules/promotions/promotions.service';
import { CreateCouponDto } from '@/modules/promotions/dto/create-coupon.dto';
import { UpdateCouponDto } from '@/modules/promotions/dto/update-coupon.dto';
import { CouponQueryDto } from '@/modules/promotions/dto/coupon-query.dto';
import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { ResponseMessage } from '@/decorator/customize';
import { UserRole } from '@/common/enums';
import type { IUser } from '@/interface/user.interface';

@ApiTags('seller-coupons')
@ApiBearerAuth('access-token')
@Roles(UserRole.SELLER)
@Controller('seller/coupons')
export class SellerCouponsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post()
  @ResponseMessage('Tạo coupon shop thành công')
  create(@User() user: IUser, @Body() dto: CreateCouponDto) {
    return this.promotionsService.createShopCoupon(user.sub, dto);
  }

  @Get()
  @ResponseMessage('Lấy danh sách coupon của shop thành công')
  list(@User() user: IUser, @Query() query: CouponQueryDto) {
    return this.promotionsService.listSeller(user.sub, query);
  }

  @Patch(':id')
  @ResponseMessage('Cập nhật coupon thành công')
  update(@User() user: IUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCouponDto) {
    return this.promotionsService.updateCoupon(id, dto, { sellerId: user.sub });
  }

  @Delete(':id')
  @ResponseMessage('Xóa coupon thành công')
  remove(@User() user: IUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.promotionsService.deleteCoupon(id, { sellerId: user.sub });
  }
}
