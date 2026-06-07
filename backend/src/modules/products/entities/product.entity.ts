import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Check,
} from 'typeorm';
import { Shop } from '@/modules/shops/entities/shop.entity';
import { Category } from '@/modules/products/entities/category.entity';
import { ProductVariant } from '@/modules/products/entities/product-variant.entity';
import { ProductStatus } from '@/common/enums';

@Entity()
@Check('stock_quantity >= 0')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Column({ nullable: false })
  name: string;

  @Column({ nullable: false })
  slug: string;

  @Column({ nullable: true })
  sku: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: false })
  price: number;

  @Column({ type: 'int', default: 0 })
  weight: number; // đơn vị gram

  @Column({ type: 'int', nullable: true })
  length: number; // cm

  @Column({ type: 'int', nullable: true })
  width: number; // cm

  @Column({ type: 'int', nullable: true })
  height: number; // cm

  @ManyToOne(() => Category, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @OneToMany(() => ProductVariant, (variant) => variant.product, {
    cascade: true,
  })
  variants: ProductVariant[];

  @Column({ type: 'varchar', nullable: true })
  thumbnail_url: string | null;

  @Column({ type: 'simple-array', nullable: true })
  gallery: string[] | null;

  @Column({ type: 'int', default: 0 })
  stock_quantity: number;

  @Column({ default: false })
  has_variants: boolean;

  @Column({ default: false })
  is_hidden: boolean;

  @Column({ default: false })
  is_featured: boolean;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
  })
  status: ProductStatus;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
