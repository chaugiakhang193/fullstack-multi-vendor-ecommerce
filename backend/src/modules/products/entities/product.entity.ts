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
import { User } from '@/modules/users/entities/user.entity';

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

  // Nhóm màu — nguồn sự thật cho metadata màu: { [color]: { hex, images } }.
  // hex (optional) cho chấm màu; images là ảnh của màu (variant KHÔNG ghi ảnh riêng).
  // Đọc: resolver bơm variant.images = color_groups[attributes.color].images. Xem resolver.
  @Column({ type: 'jsonb', nullable: true })
  color_groups: Record<string, { hex: string | null; images: string[] }> | null;

  @Column({ type: 'int', default: 0 })
  stock_quantity: number;

  // Cột GENERATED trong Postgres (= stock_quantity đang bằng 0). CHỈ ĐỌC — `insert/update: false`
  // để TypeORM không cố ghi vào cột do DB tự tính. Tồn tại để danh sách công khai ORDER BY được
  // trên một cột đã map: TypeORM phân trang bằng subquery distinct và tra metadata cột cho từng
  // mục ORDER BY, nên biểu thức thô (`stock_quantity = 0`) làm nó ném lỗi 'databaseName'.
  // KHÔNG đặt `select: false`: subquery distinct sẽ không đưa cột vào SELECT list trong khi
  // ORDER BY vẫn trỏ tới nó ⇒ 'column distinctAlias.product_is_out_of_stock does not exist'.
  @Column({ type: 'boolean', insert: false, update: false })
  is_out_of_stock: boolean;

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

  // ===== Moderation (admin take-down) =====
  @Column({ type: 'text', nullable: true })
  moderation_reason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  moderated_at: Date | null;

  // Admin thực hiện; giữ record kể cả khi admin bị xóa (SET NULL).
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'moderated_by' })
  moderated_by: User | null;

  @Column({ type: 'decimal', precision: 2, scale: 1, default: 0 })
  avg_rating: number;

  @Column({ type: 'int', default: 0 })
  review_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
