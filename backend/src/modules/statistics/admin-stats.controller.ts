import { Controller, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { AdminStatsResponseDto } from './dto/admin-stats-response.dto';
import { Roles } from '@/decorator/roles.decorator';
import { ResponseMessage } from '@/decorator/customize';
import { ApiGenericResponse } from '@/decorator/api-response.decorator';
import { UserRole } from '@/common/enums';

@ApiTags('admin-stats')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@ApiUnauthorizedResponse({ description: 'Chưa đăng nhập.' })
@ApiForbiddenResponse({ description: 'Yêu cầu quyền ADMIN.' })
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy thống kê tổng quan (Admin)' })
  @ResponseMessage('Lấy thống kê tổng quan thành công')
  @ApiGenericResponse(
    AdminStatsResponseDto,
    'Lấy thống kê tổng quan thành công',
  )
  getOverview(): Promise<AdminStatsResponseDto> {
    return this.statisticsService.getAdminOverview();
  }
}
