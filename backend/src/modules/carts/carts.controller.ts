import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiParam,
} from '@nestjs/swagger';

// Services
import { CartsService } from '@/modules/carts/carts.service';

// DTOs
import { AddCartItemDto } from '@/modules/carts/dto/add-cart-item.dto';
import { UpdateCartItemDto } from '@/modules/carts/dto/update-cart-item.dto';
import { MergeCartDto } from '@/modules/carts/dto/merge-cart.dto';
import { CartResponseDto } from '@/modules/carts/dto/cart-response.dto';

// Decorators & Guards
import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { ResponseMessage } from '@/decorator/customize';
import { ApiGenericResponse } from '@/decorator/api-response.decorator';

// Enums & Interfaces
import { UserRole } from '@/common/enums';
import type { IUser } from '@/interface/user.interface';

@ApiTags('cart')
@ApiBearerAuth('access-token')
@Roles(UserRole.CUSTOMER, UserRole.SELLER)
@Controller('cart')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Post('items')
  @ApiOperation({ summary: 'Thêm sản phẩm vào giỏ hàng' })
  @ResponseMessage('Đã thêm sản phẩm vào giỏ hàng')
  @ApiGenericResponse(CartResponseDto, 'Thêm sản phẩm thành công', {
    status: 201,
  })
  @ApiResponse({
    status: 400,
    description:
      'Yêu cầu không hợp lệ (tự mua hàng của mình, vượt giới hạn, ...)',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy sản phẩm/biến thể' })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({
    description: 'Admin không được phép thực hiện hành động này',
  })
  addItem(@User() user: IUser, @Body() dto: AddCartItemDto) {
    const userId = user.sub;
    return this.cartsService.addItem(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Xem giỏ hàng hiện tại (nhóm theo shop)' })
  @ResponseMessage('Lấy giỏ hàng thành công')
  @ApiGenericResponse(CartResponseDto, 'Thông tin giỏ hàng')
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({
    description: 'Admin không được phép thực hiện hành động này',
  })
  getCart(@User() user: IUser) {
    return this.cartsService.getCart(user.sub);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Cập nhật số lượng của sản phẩm trong giỏ hàng' })
  @ResponseMessage('Cập nhật số lượng thành công')
  @ApiGenericResponse(CartResponseDto, 'Cập nhật số lượng thành công')
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy sản phẩm trong giỏ hàng của user',
  })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({
    description: 'Admin không được phép thực hiện hành động này',
  })
  @ApiParam({
    name: 'id',
    description:
      'ID của bản ghi giỏ hàng (Cart Item ID - lấy từ trường "id" ở cấp ngoài cùng của response GET /cart), KHÔNG phải Product ID',
    example: 'd1b85fb4-3449-45cf-a407-d26b808a55b8',
  })
  updateItem(
    @User() user: IUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartsService.updateItemQuantity(user.sub, id, dto);
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Xóa một sản phẩm khỏi giỏ hàng' })
  @ResponseMessage('Đã xóa sản phẩm khỏi giỏ hàng')
  @ApiGenericResponse(CartResponseDto, 'Xóa sản phẩm thành công')
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy sản phẩm trong giỏ hàng của user',
  })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({
    description: 'Admin không được phép thực hiện hành động này',
  })
  @ApiParam({
    name: 'id',
    description:
      'ID của bản ghi giỏ hàng (Cart Item ID - lấy từ trường "id" ở cấp ngoài cùng của response GET /cart), KHÔNG phải Product ID',
    example: 'd1b85fb4-3449-45cf-a407-d26b808a55b8',
  })
  removeItem(@User() user: IUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cartsService.removeItem(user.sub, id);
  }

  @Delete()
  @ApiOperation({ summary: 'Xóa toàn bộ giỏ hàng' })
  @ResponseMessage('Đã xóa toàn bộ giỏ hàng')
  @ApiGenericResponse(CartResponseDto, 'Xóa toàn bộ giỏ hàng thành công')
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({
    description: 'Admin không được phép thực hiện hành động này',
  })
  clearCart(@User() user: IUser) {
    return this.cartsService.clearCart(user.sub);
  }

  @Post('merge')
  @ApiOperation({
    summary: 'Gộp giỏ hàng từ khách vãng lai (localStorage) vào tài khoản',
  })
  @ResponseMessage('Gộp giỏ hàng thành công')
  @ApiGenericResponse(CartResponseDto, 'Giỏ hàng sau khi gộp')
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({
    description: 'Admin không được phép thực hiện hành động này',
  })
  mergeCart(@User() user: IUser, @Body() dto: MergeCartDto) {
    return this.cartsService.mergeCart(user.sub, dto);
  }
}
