import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ReturnStatus, ReturnReason } from '@/common/enums';
import { SubOrder } from '@/modules/orders/entities/sub-order.entity';
import { Shop } from '@/modules/shops/entities/shop.entity';
import { User } from '@/modules/users/entities/user.entity';
import { ReturnItem } from './return-item.entity';

@Entity()
// Index phục vụ truy vấn seller (Part 2): "các yêu cầu trả của shop theo trạng thái".
@Index(['shop', 'status'])
export class ReturnRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SubOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sub_order_id' })
  sub_order: SubOrder;

  // Khách tạo yêu cầu — dùng để kiểm IDOR (chỉ chủ đơn được thao tác).
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: User;

  // Denormalize shop để seller query trực tiếp không cần join sub_order.
  @ManyToOne(() => Shop, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @OneToMany(() => ReturnItem, (item) => item.return_request, { cascade: true })
  items: ReturnItem[];

  @Column({ type: 'enum', enum: ReturnStatus, default: ReturnStatus.REQUESTED })
  status: ReturnStatus;

  @Column({ type: 'enum', enum: ReturnReason })
  reason: ReturnReason;

  // Ghi chú của khách (bắt buộc ở DTO). text nullable ở DB cho linh hoạt.
  // Đối xứng với seller_note (Part 2) để đọc phát hiểu ai ghi cái nào.
  @Column({ type: 'text', nullable: true })
  customer_note: string | null;

  // Tổng tiền hoàn dự kiến = tổng refund_amount các dòng. Snapshot tại lúc tạo.
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  refund_total: number;

  // ===== Các cột dành cho Part 2 (seller xử lý) — thêm sẵn để tránh migration lần 2 =====
  // Ghi chú của seller khi từ chối/duyệt.
  @Column({ type: 'text', nullable: true })
  seller_note: string | null;

  // Thời điểm request chuyển sang trạng thái cuối (RECEIVED/REJECTED/CANCELLED).
  @Column({ type: 'timestamp', nullable: true })
  resolved_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
