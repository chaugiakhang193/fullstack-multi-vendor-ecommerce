import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PromotionsService } from '@/modules/promotions/promotions.service';
import { CreateCouponDto } from '@/modules/promotions/dto/create-coupon.dto';
import { UpdateCouponDto } from '@/modules/promotions/dto/update-coupon.dto';
import { CouponQueryDto } from '@/modules/promotions/dto/coupon-query.dto';
import { Roles } from '@/decorator/roles.decorator';
import { ResponseMessage } from '@/decorator/customize';
import { UserRole } from '@/common/enums';

@ApiTags('admin-coupons')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post()
  @ResponseMessage('Tạo coupon global thành công')
  create(@Body() dto: CreateCouponDto) {
    return this.promotionsService.createGlobalCoupon(dto);
  }

  @Get()
  @ResponseMessage('Lấy danh sách coupon thành công')
  list(@Query() query: CouponQueryDto) {
    return this.promotionsService.listAdmin(query);
  }

  @Patch(':id')
  @ResponseMessage('Cập nhật coupon thành công')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCouponDto) {
    return this.promotionsService.updateCoupon(id, dto, {});
  }

  @Delete(':id')
  @ResponseMessage('Xóa coupon thành công')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.promotionsService.deleteCoupon(id, {});
  }
}
