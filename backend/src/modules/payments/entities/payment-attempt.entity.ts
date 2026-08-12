import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { PaymentStatus } from '@/common/enums';
import { Payment } from '@/modules/payments/entities/payment.entity';

/**
 * Một lần khách bấm "thanh toán" trên cùng một Payment.
 *
 * Payment giữ trạng thái HIỆN TẠI (khách còn nợ tiền hay không), còn bảng này giữ
 * LỊCH SỬ từng lần thử. Tách ra vì mỗi lần thử có vnp_txn_ref riêng, mà IPN tra
 * cứu theo đúng mã đó: ghi đè lên một row Payment duy nhất thì IPN của lần thử cũ
 * đến muộn sẽ không tìm thấy gì và trả RspCode 01 (khách mất tiền, đơn vẫn "chưa trả").
 */
@Entity()
export class PaymentAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Khai FK tường minh song song với quan hệ: handleVnpayIpn khoá row attempt bằng
  // pessimistic_write nên KHÔNG load được relations (outer join + FOR UPDATE vỡ),
  // vẫn cần biết payment nào để đồng bộ trạng thái.
  @Column({ type: 'uuid' })
  payment_id: string;

  @ManyToOne(() => Payment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment;

  // Mã giao dịch gửi lên VNPay ở CHÍNH lần thử này — khoá tra cứu của IPN.
  @Index('UQ_payment_attempt_vnp_txn_ref', { unique: true })
  @Column({ type: 'varchar' })
  vnp_txn_ref: string;

  // Số tiền tại thời điểm dựng URL. Không suy ngược từ payment.amount được vì đơn
  // có thể bị hủy bớt sub-order giữa hai lần thử.
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  // enumName trỏ thẳng enum có sẵn của bảng payment — không khai thì TypeORM coi
  // như cần một type mới tên payment_attempt_status_enum, lệch với migration.
  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status_enum',
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ type: 'varchar', nullable: true })
  vnp_transaction_no: string | null;

  @Column({ type: 'varchar', nullable: true })
  vnp_response_code: string | null;

  // Mốc IPN của lần thử này về tới. NULL = chưa có IPN (khách bỏ ngang / URL hết hạn).
  @Column({ type: 'timestamp', nullable: true })
  ipn_received_at: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  raw: Record<string, string> | null;

  @CreateDateColumn()
  created_at: Date;
}
