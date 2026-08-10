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
    // Ưu tiên cf-connecting-ip: Cloudflare tự ghi đè bằng IP kết nối TCP thật,
    // client không giả được — cùng "chân lý IP" ClientIpThrottlerGuard đang
    // dùng cho rate-limit. x-forwarded-for là fallback (client tự đặt được,
    // chấp nhận vì field này chỉ dùng để VNPay log/chấm rủi ro, không verify gì).
    const cfConnectingIpHeader =
      (req.headers['cf-connecting-ip'] as string) ?? '';
    const cfConnectingIp = cfConnectingIpHeader.trim();
    const forwardedHeader = (req.headers['x-forwarded-for'] as string) ?? '';
    const firstForwardedIp = forwardedHeader.split(',')[0].trim();
    const socketIp = req.socket.remoteAddress || '';
    const ipAddr = cfConnectingIp || firstForwardedIp || socketIp;

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
