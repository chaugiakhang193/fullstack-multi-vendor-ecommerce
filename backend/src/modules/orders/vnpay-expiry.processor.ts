import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

// Services
import { OrdersService } from '@/modules/orders/orders.service';

// Constants
import { VNPAY_EXPIRY_QUEUE } from '@/modules/orders/vnpay-expiry.constants';

interface ExpireOrderJobData {
  orderId: string;
}

/**
 * Worker hủy đơn VNPAY quá hạn giữ hàng.
 *
 * Nằm trong OrdersModule chứ không phải PaymentsModule: OrdersModule đã import
 * PaymentsModule, đặt worker bên kia rồi gọi ngược OrdersService là circular.
 *
 * KHÔNG tự kiểm tra hạn ở đây — expireUnpaidVnpayOrder tự kiểm bên trong, vì mốc
 * có thể đã trượt sau khi job được hẹn (khách bấm thử lại).
 */
@Processor(VNPAY_EXPIRY_QUEUE, {
  // Tần suất quét kiểm tra và khôi phục các job bị kẹt (stalled)
  stalledInterval: 150000, // 2.5 phút
  // Thời gian chờ long-polling tối đa khi hàng đợi rỗng để tối ưu hóa tần suất lệnh gửi tới Redis
  drainDelay: 60, // 60 giây
})
export class VnpayExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(VnpayExpiryProcessor.name);

  constructor(private readonly ordersService: OrdersService) {
    super();
  }

  async process(job: Job<ExpireOrderJobData>): Promise<void> {
    const orderId = job.data.orderId;
    const result = await this.ordersService.expireUnpaidVnpayOrder(orderId);
    if (!result.expired) {
      // Bình thường: job của lần thử cũ chạy trước khi hạn thật tới.
      this.logger.debug(
        `[VnpayExpiryProcessor] Đơn ${orderId} chưa tới hạn hoặc đã xử lý — bỏ qua`,
      );
    }
  }
}
