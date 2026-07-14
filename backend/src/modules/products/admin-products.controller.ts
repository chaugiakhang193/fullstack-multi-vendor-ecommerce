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
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';

// Services
import { ProductsService } from './products.service';

// DTOs
import { AdminProductQueryDto } from './dto/admin-product-query.dto';
import { ModerateProductDto } from './dto/moderate-product.dto';

// Decorators
import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { ResponseMessage } from '@/decorator/customize';
import { UserRole } from '@/common/enums';
import type { IUser } from '@/interface/user.interface';

@ApiTags('admin-products')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@ApiUnauthorizedResponse({ description: 'Chưa đăng nhập.' })
@ApiForbiddenResponse({ description: 'Yêu cầu quyền ADMIN.' })
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({
    summary: 'Admin liệt kê sản phẩm mọi shop (lọc + phân trang)',
  })
  @ResponseMessage('Lấy danh sách sản phẩm thành công')
  findAll(@Query() query: AdminProductQueryDto) {
    return this.productsService.findAllForAdmin(query);
  }

  @Patch(':id/take-down')
  @ApiOperation({ summary: 'Admin gỡ sản phẩm (SUSPENDED)' })
  @ResponseMessage('Gỡ sản phẩm thành công')
  @ApiResponse({ status: 404, description: 'Không tìm thấy sản phẩm' })
  @ApiResponse({ status: 400, description: 'Trạng thái không hợp lệ' })
  takeDown(
    @User() admin: IUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerateProductDto,
  ) {
    const adminId = admin.sub;
    const productId = id;
    const reason = dto.reason;
    return this.productsService.takeDown(adminId, productId, reason);
  }

  @Patch(':id/restore')
  @ApiOperation({ summary: 'Admin khôi phục sản phẩm bị gỡ (→ ACTIVE)' })
  @ResponseMessage('Khôi phục sản phẩm thành công')
  @ApiResponse({ status: 404, description: 'Không tìm thấy sản phẩm' })
  @ApiResponse({
    status: 400,
    description: 'Sản phẩm không ở trạng thái bị gỡ',
  })
  restore(@User() admin: IUser, @Param('id', ParseUUIDPipe) id: string) {
    const adminId = admin.sub;
    const productId = id;
    return this.productsService.restore(adminId, productId);
  }
}
