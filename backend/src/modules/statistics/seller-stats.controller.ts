import { Controller, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { SellerStatsResponseDto } from './dto/seller-stats-response.dto';
import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import { ResponseMessage } from '@/decorator/customize';
import { ApiGenericResponse } from '@/decorator/api-response.decorator';
import { UserRole } from '@/common/enums';
import type { IUser } from '@/interface/user.interface';

@ApiTags('seller-stats')
@ApiBearerAuth('access-token')
@Roles(UserRole.SELLER)
@ApiUnauthorizedResponse({ description: 'Chưa đăng nhập.' })
@ApiForbiddenResponse({ description: 'Yêu cầu quyền SELLER hoặc tài khoản shop chưa được duyệt/kích hoạt.' })
@Controller('seller/stats')
export class SellerStatsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy thống kê tổng quan (Seller)' })
  @ResponseMessage('Lấy thống kê tổng quan thành công')
  @ApiGenericResponse(
    SellerStatsResponseDto,
    'Lấy thống kê tổng quan thành công',
  )
  getOverview(@User() user: IUser): Promise<SellerStatsResponseDto> {
    const userId = user.sub;
    const stats = this.statisticsService.getSellerOverview(userId);
    return stats;
  }
}
