import { ApiProperty } from '@nestjs/swagger';
import { CategoryResponseDto } from '@/modules/products/dto/category-response.dto';
import { AccountStatus, AssetType } from '@/modules/enums';

export class UserResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002' })
  id: string;

  @ApiProperty({ example: 'seller01' })
  username: string;

  @ApiProperty({ example: 'seller@example.com' })
  email: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  full_name: string;

  @ApiProperty({ example: '0901234567' })
  phone: string;
}

export class MediaAssetResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'https://res.cloudinary.com/.../image.jpg' })
  url: string;

  @ApiProperty({ enum: AssetType, example: AssetType.SHOP_GALLERY })
  type: AssetType;

  @ApiProperty()
  created_at: Date;
}

export class ShopResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  id: string;

  @ApiProperty({
    type: () => UserResponseDto,
    description: 'Thông tin chủ cửa hàng',
    required: false,
    nullable: true,
  })
  seller?: UserResponseDto;

  @ApiProperty({ example: 'Cửa hàng quần áo ABC' })
  name: string;

  @ApiProperty({ example: 'https://res.cloudinary.com/.../logo.jpg' })
  logo_url: string;

  @ApiProperty({ example: 'https://res.cloudinary.com/.../banner.jpg' })
  banner_url: string;

  @ApiProperty({
    example: 'Chuyên cung cấp sản phẩm chất lượng',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({ example: 'Vietcombank - 123456789' })
  bank_account_info: string;

  @ApiProperty({ example: '123 Đường ABC, Quận 1, TP.HCM' })
  pickup_address: string;

  @ApiProperty({ enum: AccountStatus, example: AccountStatus.ACTIVE })
  status: AccountStatus;

  @ApiProperty({
    type: [CategoryResponseDto],
    description: 'Các danh mục kinh doanh',
  })
  categories: CategoryResponseDto[];

  @ApiProperty({
    type: [MediaAssetResponseDto],
    description: 'Bộ sưu tập ảnh của shop',
  })
  gallery: MediaAssetResponseDto[];

  @ApiProperty({ example: '2024-03-20T10:00:00Z' })
  created_at: Date;

  @ApiProperty({ example: '2024-03-20T11:00:00Z' })
  updated_at: Date;
}
