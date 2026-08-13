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
  // Hai mốc dưới bị chặn bởi quota Upstash free (500k lệnh/tháng) chứ không phải
  // bởi nhu cầu nghiệp vụ: worker rỗng vẫn tốn 8 lệnh mỗi vòng drain và 3 lệnh mỗi
  // lần quét stalled — mức cũ (60s / 2.5 phút) đốt 91% quota khi không có traffic.
  //
  // Nới stalled lên 5 phút không làm đơn kẹt lâu hơn: khi Redis mất job, đường phục
  // hồi thật là VnpayExpirySweep quét Postgres mỗi 5 phút, không phải stalled check.
  stalledInterval: 300000, // 5 phút
  drainDelay: 300, // 5 phút
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
