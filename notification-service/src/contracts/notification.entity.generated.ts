// AUTO-GENERATED bởi notification-service/scripts/gen-contracts.mjs — DO NOT EDIT.
// Nguồn: backend/src/modules/engagements/entities/notification.entity.ts. Chạy lại: npm run gen-contracts.

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { NotificationType } from './enums.generated';
import { NotificationData } from './notification.data.generated';

@Entity()
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  user_id: string;

  // Enum PostgreSQL — DB validate giá trị hợp lệ, chặt chẽ hơn varchar.
  // Trade-off: thêm giá trị mới cần migration ALTER TYPE.
  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  type: NotificationType;

  @Column({ nullable: true })
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  // Dữ liệu cấu trúc để FE render câu hiển thị (localized + bold). content giữ làm fallback.
  @Column({ type: 'jsonb', nullable: true })
  data: NotificationData | null;

  @Column({ default: false })
  is_read: boolean;

  @CreateDateColumn()
  created_at: Date;
}
