import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';

@Entity()
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ nullable: true })
  refresh_token: string;

  // Hash của refresh token ĐỜI TRƯỚC (chỉ giữ 1 đời). Cho phép request đến trễ
  // trong cùng đợt rotate (F5 nhiều tab) vẫn được chấp nhận nếu còn trong grace,
  // thay vì bị coi là reuse và revoke oan.
  @Column({ type: 'varchar', nullable: true })
  previous_refresh_token: string | null;

  // Mốc lần rotate gần nhất — dùng để tính cửa sổ ân hạn REFRESH_ROTATION_GRACE_MS.
  @Column({ type: 'timestamp', nullable: true })
  rotated_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date;
}
