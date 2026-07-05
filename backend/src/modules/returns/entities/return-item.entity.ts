import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ReturnRequest } from './return-request.entity';
import { OrderItem } from '@/modules/orders/entities/order-item.entity';

@Entity()
// Index phục vụ compute-on-read: tổng qty đã trả theo order_item.
@Index(['order_item'])
export class ReturnItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ReturnRequest, (req) => req.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'return_request_id' })
  return_request: ReturnRequest;

  @ManyToOne(() => OrderItem, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_item_id' })
  order_item: OrderItem;

  // Số lượng khách yêu cầu trả cho dòng này (1..available).
  @Column({ type: 'int' })
  quantity: number;

  // Snapshot tiền hoàn của dòng = (giá dòng / sub_total) × refundable_base. Không đổi về sau.
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  refund_amount: number;
}
