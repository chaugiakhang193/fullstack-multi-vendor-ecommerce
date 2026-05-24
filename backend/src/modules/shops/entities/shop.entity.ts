import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
} from 'typeorm';
import { AccountStatus } from '@/modules/enums';
import { User } from '@/modules/users/entities/user.entity';
import { Category } from '@/modules/products/entities/category.entity';
import { MediaAsset } from '@/modules/cloudinary/entities/media-asset.entity';

@Entity()
export class Shop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @Column({ nullable: false })
  name: string;

  @Column({ nullable: true })
  logo_url: string;

  @Column({ nullable: true })
  banner_url: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  bank_account_info: string;

  @Column({ type: 'text', nullable: true })
  pickup_address: string;

  @Column({ type: 'text', nullable: true })
  reject_reason: string | null;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.PENDING_APPROVAL,
  })
  status: AccountStatus;

  @ManyToMany(() => Category, (category) => category.shops)
  @JoinTable({
    name: 'shop_categories',
    joinColumn: { name: 'shop_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' },
  })
  categories: Category[];

  @OneToMany(() => MediaAsset, (asset) => asset.shop)
  gallery: MediaAsset[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
