import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { IdempotencyStatus } from '@/common/enums';
import { CheckoutResponseDto } from '@/modules/orders/dto/checkout-response.dto';

/**
 * Idempotency Entity
 * Lưu trữ khoá định danh duy nhất do client gửi lên (HTTP header `Idempotency-Key`)
 * cho luồng Checkout nhằm:
 *  - Chống gửi trùng (double-submit) ở pha PENDING bằng cách trả 409.
 *  - Replay response cũ đã COMPLETED trong vòng 24h thay vì tạo đơn lần 2.
 *
 * Các trường:
 *  - key: Khoá duy nhất từ client (PK).
 *  - user_id: Scope khoá theo người dùng — chặn xung đột khoá ngẫu nhiên
 *    giữa hai user và chống tấn công cố ý dùng khoá người khác để đọc cache.
 *  - status: Trạng thái xử lý (pending/completed).
 *  - response_code / response_body: Cache HTTP status và payload để replay.
 *  - created_at: Mốc thời gian khoá được khởi tạo — dùng cho cron TTL.
 *
 * Index (user_id, created_at) phục vụ truy vấn cron dọn key cũ.
 */
@Entity('idempotency_keys')
@Index(['user_id', 'created_at'])
export class Idempotency {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  key: string;

  @Column({
    type: 'enum',
    enum: IdempotencyStatus,
    default: IdempotencyStatus.PENDING,
  })
  status: IdempotencyStatus;

  @Column({ type: 'int', nullable: true })
  response_code: number;

  // Cache body HTTP đã COMPLETED để replay (hiện chỉ Checkout dùng idempotency).
  // Type cụ thể CheckoutResponseDto: bỏ được double-cast khi ghi + cast khi đọc,
  // và tương thích QueryDeepPartialEntity của TypeORM (khác 'unknown'/'any').
  @Column({ type: 'jsonb', nullable: true })
  response_body: CheckoutResponseDto | null;

  @Column({ type: 'uuid', nullable: false })
  user_id: string;

  @CreateDateColumn()
  created_at: Date;
}
