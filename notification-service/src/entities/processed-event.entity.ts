import { Entity, PrimaryColumn, CreateDateColumn } from "typeorm";

// Bảng dedupe cho consumer NS — schema do backend migration
// CreateProcessedEventsTable dựng (NS không có migration runner,
// synchronize:false). `event_id` = outbox event id trong envelope relay.
@Entity("processed_events")
export class ProcessedEvent {
  @PrimaryColumn("uuid")
  event_id: string;

  @CreateDateColumn({ type: "timestamptz" })
  created_at: Date;
}
