import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CouponType, DiscountType } from '@/common/enums';
import { Shop } from '@/modules/shops/entities/shop.entity';

@Entity()
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: false })
  code: string;

  @Column({ type: 'enum', enum: CouponType, nullable: false })
  type: CouponType;

  @ManyToOne(() => Shop, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Column({ type: 'enum', enum: DiscountType, nullable: true })
  discount_type: DiscountType;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  discount_value: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  min_order_value: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  max_discount_value: number;

  @Column({ type: 'timestamp', nullable: true })
  start_date: Date;

  @Column({ type: 'timestamp', nullable: true })
  end_date: Date;

  @Column({ type: 'int', nullable: true })
  usage_limit: number;
}
