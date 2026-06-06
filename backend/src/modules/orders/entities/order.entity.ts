import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { Coupon } from '@/modules/promotions/entities/coupon.entity';
import { SubOrder } from '@/modules/orders/entities/sub-order.entity';
import { OrderStatus } from '@/common/enums';
import { Payment } from '@/modules/payments/entities/payment.entity';

@Entity()
@Index(['customer', 'status'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer: User;

  @ManyToOne(() => Coupon, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'global_coupon_id' })
  global_coupon: Coupon;

  @OneToMany(() => SubOrder, (subOrder) => subOrder.order, { cascade: true })
  sub_orders: SubOrder[];

  @OneToOne(() => Payment, (payment) => payment.order)
  payment: Payment;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  total_amount: number;

  @Column({ type: 'jsonb', nullable: true })
  shipping_address: any;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({ type: 'varchar', unique: true, nullable: true })
  idempotency_key: string;

  @Column({ type: 'varchar', unique: true })
  order_number: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
