import { Controller, Get, Post, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PromotionsService } from '@/modules/promotions/promotions.service';
import { CouponQueryDto } from '@/modules/promotions/dto/coupon-query.dto';
import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { Public, ResponseMessage } from '@/decorator/customize';
import { UserRole } from '@/common/enums';
import type { IUser } from '@/interface/user.interface';

@ApiTags('coupons')
@ApiBearerAuth('access-token')
@Roles(UserRole.CUSTOMER)
@Controller('coupons')
export class CustomerCouponsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  @Public()
  @ResponseMessage('Lấy danh sách coupon khả dụng thành công')
  listClaimable(@User() user: IUser | undefined, @Query() query: CouponQueryDto) {
    return this.promotionsService.listClaimable(user?.sub, query);
  }

  @Get('me')
  @ResponseMessage('Lấy ví coupon thành công')
  wallet(@User() user: IUser, @Query() query: CouponQueryDto) {
    return this.promotionsService.getWallet(user.sub, query);
  }

  @Post(':id/claim')
  @ResponseMessage('Lưu coupon vào ví thành công')
  claim(@User() user: IUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.promotionsService.claimCoupon(user.sub, id);
  }
}
