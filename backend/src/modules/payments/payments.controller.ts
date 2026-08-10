import { Controller, Post, Get, Body, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';

// Services
import { PaymentsService } from './payments.service';

// DTOs
import { CreateVnpayUrlDto } from './dto/create-vnpay-url.dto';

// Decorators & Interfaces
import { Public } from '@/decorator/customize';
import { Roles } from '@/decorator/roles.decorator';
import { User } from '@/decorator/user.decorator';
import type { IUser } from '@/interface/user.interface';

// Enums
import { UserRole } from '@/common/enums';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('vnpay/create-url')
  @Roles(UserRole.CUSTOMER)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Tạo URL thanh toán VNPay cho một đơn hàng' })
  createVnpayUrl(
    @User() user: IUser,
    @Body() dto: CreateVnpayUrlDto,
    @Req() req: Request,
  ) {
    // Lấy IP thật khi qua proxy (Render). Rơi về remoteAddress nếu không có header.
    const forwardedHeader = (req.headers['x-forwarded-for'] as string) ?? '';
    const firstIp = forwardedHeader.split(',')[0].trim();
    const socketIp = req.socket.remoteAddress || '';
    const ipAddr = firstIp || socketIp;

    const orderId = dto.orderId;
    const userId = user.sub;

    const createParams = {
      orderId,
      userId,
      ipAddr,
    };
    return this.paymentsService.createVnpayPaymentUrl(createParams);
  }

  @Public()
  @Get('vnpay/ipn')
  @ApiOperation({
    summary: 'IPN VNPay (server→server) — nguồn chân lý cập nhật trạng thái',
  })
  vnpayIpn(@Query() query: Record<string, string>) {
    return this.paymentsService.handleVnpayIpn(query);
  }

  @Public()
  @Get('vnpay/return')
  @ApiOperation({
    summary: 'Return URL VNPay (browser) — chỉ hiển thị, không ghi DB',
  })
  vnpayReturn(@Query() query: Record<string, string>) {
    return this.paymentsService.handleVnpayReturn(query);
  }
}
