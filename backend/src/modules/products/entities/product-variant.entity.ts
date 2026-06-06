import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import { Product } from '@/modules/products/entities/product.entity';

@Entity()
@Check('stock_quantity >= 0')
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, (product) => product.variants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ nullable: true })
  name: string;

  @Column({ type: 'jsonb', nullable: true })
  attributes: Record<string, string>;

  @Column({ nullable: true })
  sku: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  additional_price: number;

  @Column({ type: 'int', nullable: false, default: 0 })
  stock_quantity: number;

  @Column({ type: 'simple-array', nullable: true })
  images: string[];
}
