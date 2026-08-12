import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';

// Services
import { OrdersService } from '@/modules/orders/orders.service';

// Tuning sweep. Module-level const vì @Interval() cần hằng compile-time.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const SWEEP_BATCH_SIZE = 20;

/**
 * Lưới an toàn cho VnpayExpiryProcessor.
 *
 * Vì sao cần dù đã có BullMQ: Render free ngủ sau 15' không traffic (worker không
 * chạy, job hẹn giờ không nổ) và Redis free không có persistence (restart là mất
 * sạch job). Trạng thái thật nằm ở Postgres nên quét DB luôn phục hồi được.
 *
 * Chạy thưa (5 phút) vì đây là đường phụ — đường chính là delayed job.
 */
@Injectable()
export class VnpayExpirySweep {
  private readonly logger = new Logger(VnpayExpirySweep.name);

  // Guard chống concurrent invocation trong cùng process.
  private isProcessing = false;

  constructor(
    private readonly ordersService: OrdersService,
    private readonly configService: ConfigService,
  ) {}

  private isEnabled(): boolean {
    return this.configService.get<string>('VNPAY_EXPIRY_ENABLED') === 'true';
  }

  @Interval(SWEEP_INTERVAL_MS)
  async sweepExpiredOrders(): Promise<void> {
    if (!this.isEnabled() || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      const result =
        await this.ordersService.sweepExpiredVnpayOrders(SWEEP_BATCH_SIZE);
      if (result.scanned === 0) {
        return;
      }

      const sweepMessage =
        `[VnpayExpirySweep] Quét ${result.scanned} đơn quá trần cứng, ` +
        `hủy ${result.expired} đơn (job BullMQ đã bỏ sót)`;
      this.logger.warn(sweepMessage);
    } catch (error) {
      this.logger.error('[VnpayExpirySweep.sweepExpiredOrders] Error:', error);
    } finally {
      this.isProcessing = false;
    }
  }
}
