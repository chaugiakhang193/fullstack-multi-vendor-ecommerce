import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { Product } from '@/modules/products/entities/product.entity';
import { OrderItem } from '@/modules/orders/entities/order-item.entity';

@Entity()
@Unique(['order_item'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Product, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => OrderItem, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'order_item_id' })
  order_item: OrderItem;

  @Column({ type: 'int', nullable: true })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({ type: 'text', nullable: true })
  reply_from_seller: string;

  @CreateDateColumn()
  created_at: Date;
}
