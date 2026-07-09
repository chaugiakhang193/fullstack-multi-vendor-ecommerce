import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
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

  // Trục relay— ĐỘC LẬP với `status` của OutboxWorker cũ.
  // OutboxRelay đánh dấu đã publish lên RabbitMQ qua cột này; worker cũ không đụng.
  // NULL = chưa relay. Set = now() CHỈ sau publisher confirm (at-least-once).
  @Column({ type: 'timestamptz', nullable: true })
  published_at: Date | null;

  // Số lần relay thử publish event này (tăng mỗi lần mark thành công).
  @Column({ type: 'int', default: 0 })
  publish_attempts: number;
}
