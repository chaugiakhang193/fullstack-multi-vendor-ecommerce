import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PayoutsService } from './payouts.service';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { PayoutResponseDto } from './dto/payout-response.dto';
import { BalanceResponseDto } from './dto/balance-response.dto';
import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import type { IUser } from '@/interface/user.interface';
import { UserRole } from '@/common/enums';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { ApiGenericResponse } from '@/decorator/api-response.decorator';

@ApiTags('seller-payouts')
@ApiBearerAuth('access-token')
@Roles(UserRole.SELLER)
@Controller('seller/payouts')
export class SellerPayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Lấy số dư khả dụng và thống kê tiền rút của Shop' })
  @ApiGenericResponse(
    BalanceResponseDto,
    'Số dư và thống kê tiền rút của Shop.',
  )
  getSellerBalance(@User() user: IUser) {
    const userId = user.sub;
    return this.payoutsService.getSellerBalance(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Seller gửi yêu cầu rút tiền' })
  @ApiGenericResponse(PayoutResponseDto, 'Yêu cầu rút tiền đã được gửi.')
  requestPayout(@User() user: IUser, @Body() dto: CreatePayoutDto) {
    const userId = user.sub;
    return this.payoutsService.requestPayout(userId, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Seller xem lịch sử yêu cầu rút tiền' })
  getSellerPayoutHistory(
    @User() user: IUser,
    @Query() query: PaginationQueryDto,
  ) {
    const userId = user.sub;
    return this.payoutsService.getSellerPayoutHistory(userId, query);
  }
}
