import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  BeforeInsert,
} from 'typeorm';
import { context, propagation } from '@opentelemetry/api';
import { OutboxEventStatus } from '@/common/enums';

@Entity()
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: false })
  event_type: string;

  @Column({ type: 'jsonb', nullable: false })
  payload: any;

  @Column({
    type: 'enum',
    enum: OutboxEventStatus,
    default: OutboxEventStatus.PENDING,
  })
  status: OutboxEventStatus;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  processed_at: Date | null;

  // Cột `status` (bên trên) là di sản — không còn ai chuyển PENDING→PROCESSED
  // sau cut-off; relay dùng cột này (`published_at`) độc lập, không đọc `status`.
  // OutboxRelay đánh dấu đã publish lên RabbitMQ qua cột này.
  // NULL = chưa relay. Set = now() CHỈ sau publisher confirm (at-least-once).
  @Column({ type: 'timestamptz', nullable: true })
  published_at: Date | null;

  // Số lần relay thử publish event này (tăng mỗi lần mark thành công).
  @Column({ type: 'int', default: 0 })
  publish_attempts: number;

  // W3C traceparent của request đã SINH ra event này.
  // Vì sao phải lưu vào DB: relay publish ở một vòng @Interval khác, lúc đó ngữ cảnh
  // trace trong RAM đã mất → không có cách nào nối span nếu không chuyền qua DB.
  // NULL = row cũ, hoặc lúc ghi không bật tracing. Relay phải chịu được NULL.
  @Column({ type: 'varchar', length: 64, nullable: true })
  trace_parent: string | null;

  // Bơm traceparent tự động cho MỌI chỗ ghi outbox (~10 call site nằm trong
  // orders/payouts/returns/engagements, có cả luồng tiền) mà KHÔNG phải sửa
  // dòng nào trong các service đó. Mọi call site đều dùng manager.save() nên
  // listener này chạy. Không bao giờ được ném lỗi: quan sát hỏng thì kệ,
  // KHÔNG được làm hỏng đơn hàng.
  @BeforeInsert()
  captureTraceParent(): void {
    try {
      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);
      this.trace_parent = carrier.traceparent ?? null;
    } catch {
      this.trace_parent = null;
    }
  }
}
