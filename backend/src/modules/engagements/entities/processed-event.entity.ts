import { Entity, PrimaryColumn, CreateDateColumn } from 'typeorm';

// Dedupe cho NotificationProjectionConsumer (Phase 6, part_03). Tái dùng bảng
// processed_events sẵn có ở DB monolith (migration CreateProcessedEventsTable
// 264 — NS đã dời sang DB#2 nên bảng này mồ côi). event_id = eventId trong
// envelope notification.created (= id của notification_outbox bên NS).
@Entity('processed_events')
export class ProcessedEvent {
  @PrimaryColumn('uuid')
  event_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
