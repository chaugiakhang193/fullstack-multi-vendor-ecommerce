import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// Entities
import { Idempotency } from '@/modules/orders/entities/idempotency.entity';

// Enums
import { IdempotencyStatus } from '@/common/enums';

/**
 * Cron dọn dẹp bảng `idempotency_keys` theo 2 chính sách TTL riêng biệt:
 *   - COMPLETED: giữ 24h để replay response cho client retry.
 *   - PENDING:  giữ 5 phút (stale-timeout) để reclaim trường hợp request crashed
 *               giữa chừng mà chưa kịp hoàn tất / xóa key.
 *
 * Nếu giữa Phase 2 commit thành công và Phase 3 update COMPLETED có sự cố
 * khiến key bị xóa sớm, retry tiếp theo sẽ va vào unique constraint trên
 * cột `order.idempotency_key` và được xử lý ở OrdersService.checkout
 * (crash recovery path) — đảm bảo không tạo đơn trùng.
 */
@Injectable()
export class IdempotencyCleanupCron {
  private readonly logger = new Logger(IdempotencyCleanupCron.name);

  private readonly COMPLETED_TTL_MS = 24 * 60 * 60 * 1000; // 24 giờ
  private readonly PENDING_STALE_MS = 5 * 60 * 1000; // 5 phút

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCleanup(): Promise<void> {
    const now = Date.now();
    const completedExpiryDate = new Date(now - this.COMPLETED_TTL_MS);
    const pendingExpiryDate = new Date(now - this.PENDING_STALE_MS);

    const idempotencyRepo = this.dataSource.getRepository(Idempotency);

    try {
      const deleteQb = idempotencyRepo
        .createQueryBuilder()
        .delete()
        .where(
          '(status = :completed AND created_at < :completedExpiry) OR (status = :pending AND created_at < :pendingExpiry)',
          {
            completed: IdempotencyStatus.COMPLETED,
            pending: IdempotencyStatus.PENDING,
            completedExpiry: completedExpiryDate,
            pendingExpiry: pendingExpiryDate,
          },
        );
      const deleteResult = await deleteQb.execute();

      const affected = deleteResult.affected ?? 0;
      if (affected > 0) {
        const cleanupMsg = `Đã dọn ${affected} idempotency key(s) hết hạn`;
        this.logger.log(cleanupMsg);
      }
    } catch (error) {
      const failMsg = '[IdempotencyCleanupCron.handleCleanup] Error:';
      this.logger.error(failMsg, error);
    }
  }
}
