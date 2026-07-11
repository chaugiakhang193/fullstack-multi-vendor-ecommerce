import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

// Symmetric outbox phía NS. Mỗi notification NS tạo (mode
// distributed) ghi 1 row ở đây CÙNG transaction → zero dual-write. Relay poll
// row published_at IS NULL, publish notification.created lên notifications.events,
// mark published_at. Lean hơn OutboxEvent monolith: KHÔNG cột status (NS không có
// worker cũ chạy trục song song).
@Entity("notification_outbox")
export class NotificationOutbox {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Luôn 'notification.created' hiện tại; giữ generic cho event NS tương lai.
  @Column({ type: "varchar" })
  event_type: string;

  // Snapshot notification (shape = NotificationCreatedPayload). Để `unknown` CHỦ
  // Ý, KHÔNG type interface trực tiếp: TypeORM QueryDeepPartialEntity đệ quy vào
  // jsonb → vỡ với field Date/nested (lý do monolith OutboxEvent để `any`).
  // Type-safety nằm ở BIÊN GHI: NotificationService.toPayload() return
  // NotificationCreatedPayload. Bên đọc (consumer part_03) phải validate jsonb.
  @Column({ type: "jsonb" })
  payload: unknown;

  @CreateDateColumn({ type: "timestamptz" })
  created_at: Date;

  // NULL = chưa relay. Set = now() CHỈ sau publisher confirm (at-least-once).
  @Column({ type: "timestamptz", nullable: true })
  published_at: Date | null;

  @Column({ type: "int", default: 0 })
  publish_attempts: number;
}
