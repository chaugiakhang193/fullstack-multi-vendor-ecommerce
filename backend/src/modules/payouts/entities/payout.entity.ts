import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Shop } from '@/modules/shops/entities/shop.entity';
import { User } from '@/modules/users/entities/user.entity';
import { PayoutStatus } from '@/common/enums';

@Entity()
export class Payout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Shop, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: false })
  amount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  commission_fee: number;

  @Column({
    type: 'enum',
    enum: PayoutStatus,
    default: PayoutStatus.PENDING,
  })
  status: PayoutStatus;

  @Column({ type: 'text', nullable: true })
  reject_reason: string | null;

  @Column({ type: 'jsonb', nullable: false })
  bank_info_snapshot: Record<string, any>;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolved_by' })
  resolved_by: User | null;

  @Column({ type: 'timestamp', nullable: true })
  resolved_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
