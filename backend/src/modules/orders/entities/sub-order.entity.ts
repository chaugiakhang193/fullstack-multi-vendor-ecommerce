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
import { OrderStatus } from '@/common/enums';
import { Shop } from '@/modules/shops/entities/shop.entity';
import { Order } from '@/modules/orders/entities/order.entity';
import { Coupon } from '@/modules/promotions/entities/coupon.entity';
import { OrderItem } from './order-item.entity';

@Entity()
@Index(['shop', 'status'])
export class SubOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Shop, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @ManyToOne(() => Order, (order) => order.sub_orders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @ManyToOne(() => Coupon, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shop_coupon_id' })
  shop_coupon: Coupon;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.sub_order, {
    cascade: true,
  })
  items: OrderItem[];

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  sub_total: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  shipping_fee: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  discount_amount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  total_amount: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
