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
import { UsersService } from './users.service';

// DTOs
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { AddressResponseDto } from './dto/address-response.dto';

// Decorators & Guards
import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { ResponseMessage } from '@/decorator/customize';
import { ApiGenericResponse } from '@/decorator/api-response.decorator';

// Enums & Interfaces
import { UserRole } from '@/common/enums';
import type { IUser } from '@/interface/user.interface';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Roles(UserRole.CUSTOMER, UserRole.SELLER)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('me/addresses')
  @ApiOperation({ summary: 'Thêm địa chỉ giao hàng mới' })
  @ResponseMessage('Thêm địa chỉ thành công')
  @ApiGenericResponse(AddressResponseDto, 'Thêm địa chỉ thành công', { status: 201 })
  @ApiResponse({ status: 400, description: 'Yêu cầu không hợp lệ (số điện thoại sai, quá giới hạn 10 địa chỉ...)' })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({ description: 'Admin không được phép thực hiện hành động này' })
  addAddress(@User() user: IUser, @Body() dto: CreateAddressDto) {
    const userId = user.sub;
    return this.usersService.addAddress(userId, dto);
  }

  @Get('me/addresses')
  @ApiOperation({ summary: 'Lấy danh sách địa chỉ của tôi' })
  @ResponseMessage('Lấy danh sách địa chỉ thành công')
  @ApiGenericResponse(AddressResponseDto, 'Danh sách địa chỉ của người dùng', { isArray: true })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({ description: 'Admin không được phép thực hiện hành động này' })
  getAddresses(@User() user: IUser) {
    const userId = user.sub;
    return this.usersService.getAddresses(userId);
  }

  @Patch('me/addresses/:id')
  @ApiOperation({ summary: 'Cập nhật địa chỉ giao hàng' })
  @ResponseMessage('Cập nhật địa chỉ thành công')
  @ApiGenericResponse(AddressResponseDto, 'Cập nhật địa chỉ thành công')
  @ApiResponse({ status: 404, description: 'Không tìm thấy địa chỉ' })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({ description: 'Admin không được phép thực hiện hành động này' })
  @ApiParam({ name: 'id', description: 'ID của địa chỉ cần cập nhật (UUID)' })
  updateAddress(
    @User() user: IUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    const userId = user.sub;
    return this.usersService.updateAddress(userId, id, dto);
  }

  @Delete('me/addresses/:id')
  @ApiOperation({ summary: 'Xóa địa chỉ giao hàng' })
  @ResponseMessage('Xóa địa chỉ thành công')
  @ApiGenericResponse('Xóa địa chỉ thành công')
  @ApiResponse({ status: 404, description: 'Không tìm thấy địa chỉ' })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({ description: 'Admin không được phép thực hiện hành động này' })
  @ApiParam({ name: 'id', description: 'ID của địa chỉ cần xóa (UUID)' })
  deleteAddress(
    @User() user: IUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const userId = user.sub;
    return this.usersService.deleteAddress(userId, id);
  }

  @Patch('me/addresses/:id/set-default')
  @ApiOperation({ summary: 'Đặt địa chỉ làm mặc định' })
  @ResponseMessage('Đặt địa chỉ mặc định thành công')
  @ApiGenericResponse(AddressResponseDto, 'Đặt địa chỉ mặc định thành công')
  @ApiResponse({ status: 404, description: 'Không tìm thấy địa chỉ' })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiForbiddenResponse({ description: 'Admin không được phép thực hiện hành động này' })
  @ApiParam({ name: 'id', description: 'ID của địa chỉ cần đặt làm mặc định (UUID)' })
  setDefaultAddress(
    @User() user: IUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const userId = user.sub;
    return this.usersService.setDefaultAddress(userId, id);
  }
}
