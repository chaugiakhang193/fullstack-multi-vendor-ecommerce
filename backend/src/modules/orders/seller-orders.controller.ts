import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { OrdersService } from '@/modules/orders/orders.service';
import { SellerOrderQueryDto } from '@/modules/orders/dto/seller-order-query.dto';
import { UpdateSubOrderStatusDto } from '@/modules/orders/dto/update-sub-order-status.dto';

import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { ResponseMessage } from '@/decorator/customize';
import { UserRole } from '@/common/enums';
import type { IUser } from '@/interface/user.interface';

@ApiTags('seller-orders')
@ApiBearerAuth('access-token')
@Roles(UserRole.SELLER)
@Controller('seller/orders')
export class SellerOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách đơn hàng con của Shop (phân trang + lọc status)' })
  @ResponseMessage('Lấy danh sách đơn hàng của shop thành công')
  @ApiOkResponse({ description: 'Danh sách sub-order kèm order + items' })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập / không phải seller' })
  getSellerOrders(@User() user: IUser, @Query() query: SellerOrderQueryDto) {
    return this.ordersService.getSellerSubOrders(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết 1 đơn hàng con của Shop' })
  @ApiParam({ name: 'id', description: 'UUID sub-order' })
  @ResponseMessage('Lấy chi tiết đơn hàng con thành công')
  @ApiNotFoundResponse({ description: 'Không tìm thấy (hoặc không thuộc shop của bạn)' })
  getSellerOrderDetail(
    @User() user: IUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.getSellerSubOrderDetail(user.sub, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Seller đổi trạng thái đơn hàng con (theo State Machine)' })
  @ApiParam({ name: 'id', description: 'UUID sub-order' })
  @ResponseMessage('Cập nhật trạng thái đơn hàng con thành công')
  @ApiOkResponse({ description: 'Đã cập nhật, trả về status sub-order + Master mới' })
  @ApiBadRequestResponse({ description: 'Chuyển trạng thái không hợp lệ theo State Machine' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy (hoặc không thuộc shop của bạn)' })
  updateStatus(
    @User() user: IUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubOrderStatusDto,
  ) {
    return this.ordersService.updateSubOrderStatus(user.sub, id, dto.status);
  }
}
