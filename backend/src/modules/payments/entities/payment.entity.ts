import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { PaymentMethod, PaymentStatus } from '@/common/enums';
import { Order } from '@/modules/orders/entities/order.entity';

@Entity()
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Order, (order) => order.payment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  method: PaymentMethod;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount: number;

  // Mã giao dịch phía merchant gửi lên VNPay (vnp_TxnRef). Là khoá tra cứu khi IPN
  // gọi về. Unique phần (chỉ khi khác NULL) khai ở migration để COD giữ NULL thoải mái.
  @Index('UQ_payment_vnp_txn_ref', {
    unique: true,
    where: '"vnp_txn_ref" IS NOT NULL',
  })
  @Column({ type: 'varchar', nullable: true })
  vnp_txn_ref: string | null;

  // Mã giao dịch VNPay trả về (vnp_TransactionNo) — để đối soát với cổng.
  @Column({ type: 'varchar', nullable: true })
  vnp_transaction_no: string | null;

  // Mã kết quả VNPay (vnp_ResponseCode): '00' = thành công.
  @Column({ type: 'varchar', nullable: true })
  vnp_response_code: string | null;

  // Mốc IPN xác nhận trả tiền thành công. NULL nếu chưa/không thành công.
  @Column({ type: 'timestamp', nullable: true })
  paid_at: Date | null;

  // Toàn bộ query VNPay gửi ở IPN — giữ nguyên để đối soát/tra cứu về sau.
  @Column({ type: 'jsonb', nullable: true })
  raw: Record<string, string> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
