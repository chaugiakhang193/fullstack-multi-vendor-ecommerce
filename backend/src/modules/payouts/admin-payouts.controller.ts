import { Controller, Get, Patch, Param, Body, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { PayoutsService } from './payouts.service';
import { RejectPayoutDto } from './dto/reject-payout.dto';
import { PayoutResponseDto } from './dto/payout-response.dto';
import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import type { IUser } from '@/interface/user.interface';
import { UserRole } from '@/common/enums';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { ApiGenericResponse } from '@/decorator/api-response.decorator';

@ApiTags('admin-payouts')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get()
  @ApiOperation({ summary: 'Admin xem danh sách tất cả yêu cầu rút tiền' })
  getAdminPayouts(@Query() query: PaginationQueryDto) {
    return this.payoutsService.getAdminPayouts(query);
  }

  @Patch(':payoutId/approve')
  @ApiOperation({ summary: 'Admin phê duyệt yêu cầu rút tiền' })
  @ApiParam({ name: 'payoutId', description: 'UUID của yêu cầu rút tiền' })
  @ApiGenericResponse(PayoutResponseDto, 'Yêu cầu rút tiền được chấp nhận.')
  approvePayout(
    @Param('payoutId', ParseUUIDPipe) payoutId: string,
    @User() admin: IUser,
  ) {
    const adminId = admin.sub;
    return this.payoutsService.approvePayout(payoutId, adminId);
  }

  @Patch(':payoutId/reject')
  @ApiOperation({ summary: 'Admin từ chối yêu cầu rút tiền' })
  @ApiParam({ name: 'payoutId', description: 'UUID của yêu cầu rút tiền' })
  @ApiGenericResponse(PayoutResponseDto, 'Yêu cầu rút tiền đã bị từ chối.')
  rejectPayout(
    @Param('payoutId', ParseUUIDPipe) payoutId: string,
    @Body() dto: RejectPayoutDto,
    @User() admin: IUser,
  ) {
    const adminId = admin.sub;
    return this.payoutsService.rejectPayout(payoutId, dto, adminId);
  }
}
