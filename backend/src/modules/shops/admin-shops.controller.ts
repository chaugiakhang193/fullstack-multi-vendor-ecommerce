import { Controller, Get, Patch, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';

// Services
import { ShopsService } from '@/modules/shops/shops.service';

// DTOs
import { ShopResponseDto } from '@/modules/shops/dto/shop-response.dto';
import { RejectShopDto } from '@/modules/shops/dto/reject-shop.dto';

// Guards & Decorators
import { Roles } from '@/decorator/roles.decorator';
import { ResponseMessage } from '@/decorator/customize';
import { ApiGenericResponse } from '@/decorator/api-response.decorator';

// Enums
import { UserRole } from '@/common/enums';

@ApiTags('admin-shops')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@ApiUnauthorizedResponse({ description: 'Chưa đăng nhập.' })
@ApiForbiddenResponse({ description: 'Yêu cầu quyền ADMIN.' })
@Controller('admin/shops')
export class AdminShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Get()
  @ApiOperation({ summary: 'Admin lấy danh sách tất cả gian hàng' })
  @ApiGenericResponse(ShopResponseDto, 'Lấy danh sách thành công.', {
    isArray: true,
  })
  findAll() {
    return this.shopsService.findAll();
  }

  @Get('pending')
  @ApiOperation({ summary: 'Admin lấy danh sách gian hàng đang chờ duyệt' })
  @ApiGenericResponse(ShopResponseDto, 'Lấy danh sách chờ duyệt thành công.', {
    isArray: true,
  })
  getPendingShops() {
    return this.shopsService.getPendingShops();
  }

  @Get(':id')
  @ResponseMessage('Lấy chi tiết gian hàng thành công.')
  @ApiOperation({ summary: 'Admin xem chi tiết một gian hàng' })
  @ApiGenericResponse(ShopResponseDto, 'Lấy chi tiết gian hàng thành công.')
  findOneAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.shopsService.findOneByShopId(id);
  }

  @Patch(':id/approve')
  @ResponseMessage('Đã duyệt gian hàng thành công.')
  @ApiOperation({ summary: 'Admin duyệt gian hàng' })
  @ApiGenericResponse(ShopResponseDto, 'Duyệt gian hàng thành công.')
  approveShop(@Param('id', ParseUUIDPipe) id: string) {
    return this.shopsService.approveShop(id);
  }

  @Patch(':id/reject')
  @ResponseMessage('Đã từ chối gian hàng.')
  @ApiOperation({ summary: 'Admin từ chối gian hàng' })
  @ApiGenericResponse(ShopResponseDto, 'Từ chối gian hàng thành công.')
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập.' })
  @ApiForbiddenResponse({ description: 'Yêu cầu quyền ADMIN.' })
  rejectShop(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() rejectShopDto: RejectShopDto,
  ) {
    return this.shopsService.rejectShop(id, rejectShopDto.reason);
  }
}
