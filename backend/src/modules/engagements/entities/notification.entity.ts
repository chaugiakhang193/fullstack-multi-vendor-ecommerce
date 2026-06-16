import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { NotificationType } from '@/common/enums';
import { NotificationData } from '@/modules/engagements/notification.data';

@Entity()
@Index(['user', 'is_read', 'created_at'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

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
