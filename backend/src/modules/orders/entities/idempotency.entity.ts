import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';
import { IdempotencyStatus } from '@/common/enums';

/**
 * Idempotency Entity
 * Used to store unique request keys for Double-Submit Protection.
 *
 * Fields:
 * - key: The unique idempotency key sent from the client.
 * - status: The processing state of the request (pending or completed).
 * - response_code: The cached HTTP status code (nullable).
 * - response_body: The cached response payload to replay (nullable).
 * - created_at: Timestamp when the request was initiated. Used for TTL.
 */
@Entity('idempotency_keys')
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

  @Column({ type: 'jsonb', nullable: true })
  response_body: any;

  @CreateDateColumn()
  created_at: Date;
}
