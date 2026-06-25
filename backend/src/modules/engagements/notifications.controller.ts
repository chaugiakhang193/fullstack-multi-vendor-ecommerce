import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { NotificationService } from '@/modules/engagements/notification.service';
import { NotificationQueryDto } from '@/modules/engagements/dto/notification-query.dto';

import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { ResponseMessage } from '@/decorator/customize';
import { UserRole } from '@/common/enums';
import type { IUser } from '@/interface/user.interface';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Roles(UserRole.CUSTOMER, UserRole.SELLER, UserRole.ADMIN)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách thông báo của user (phân trang + lọc is_read)',
  })
  @ResponseMessage('Lấy danh sách thông báo thành công')
  @ApiOkResponse({ description: 'Danh sách notification' })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  getNotifications(@User() user: IUser, @Query() query: NotificationQueryDto) {
    return this.notificationService.getNotifications(user.sub, query);
  }

  // Khai báo route tĩnh 'read-all' TRƯỚC route động ':id/read' cho rõ ràng.
  @Patch('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo đã đọc' })
  @ResponseMessage('Đã đánh dấu tất cả là đã đọc')
  @ApiOkResponse({ description: 'Số bản ghi đã cập nhật' })
  markAllAsRead(@User() user: IUser) {
    return this.notificationService.markAllAsRead(user.sub);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu 1 thông báo đã đọc' })
  @ApiParam({ name: 'id', description: 'UUID notification' })
  @ResponseMessage('Đã đánh dấu thông báo là đã đọc')
  @ApiNotFoundResponse({
    description: 'Không tìm thấy (hoặc không thuộc về bạn)',
  })
  markAsRead(@User() user: IUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationService.markAsRead(user.sub, id);
  }
}
