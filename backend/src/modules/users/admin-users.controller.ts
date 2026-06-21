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
import { UsersService } from './users.service';

// DTOs
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';

// Decorators
import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { ResponseMessage } from '@/decorator/customize';
import {
  ApiGenericResponse,
  ApiPaginatedResponse,
} from '@/decorator/api-response.decorator';

// Enums & Interfaces
import { UserRole } from '@/common/enums';
import type { IUser } from '@/interface/user.interface';

@ApiTags('admin-users')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@ApiUnauthorizedResponse({ description: 'Chưa đăng nhập.' })
@ApiForbiddenResponse({ description: 'Yêu cầu quyền ADMIN.' })
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Admin lấy danh sách user (lọc + phân trang)' })
  @ResponseMessage('Lấy danh sách người dùng thành công')
  @ApiPaginatedResponse(
    AdminUserResponseDto,
    'Lấy danh sách người dùng thành công',
  )
  findAll(@Query() query: AdminUserQueryDto) {
    return this.usersService.findAllForAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin xem chi tiết 1 user' })
  @ResponseMessage('Lấy chi tiết người dùng thành công')
  @ApiGenericResponse(
    AdminUserResponseDto,
    'Lấy chi tiết người dùng thành công',
  )
  @ApiResponse({ status: 404, description: 'Không tìm thấy người dùng' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getProfile(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Admin đổi trạng thái user (ban/unban/suspend)' })
  @ResponseMessage('Cập nhật trạng thái người dùng thành công')
  @ApiGenericResponse(
    AdminUserResponseDto,
    'Cập nhật trạng thái người dùng thành công',
  )
  @ApiResponse({ status: 400, description: 'Dữ liệu/thao tác không hợp lệ' })
  @ApiForbiddenResponse({ description: 'Không thao tác được tài khoản admin' })
  updateStatus(
    @User() admin: IUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    const adminId = admin.sub;
    return this.usersService.updateUserStatus(adminId, id, dto);
  }
}
