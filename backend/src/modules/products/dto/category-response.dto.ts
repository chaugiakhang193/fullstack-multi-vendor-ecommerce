import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID của danh mục',
  })
  id: string;

  @ApiProperty({ example: 'Thời trang nam', description: 'Tên danh mục' })
  name: string;

  @ApiProperty({
    example: 'thoi-trang-nam',
    description: 'Slug tự động (dùng cho URL)',
  })
  slug: string;

  @ApiProperty({
    type: () => CategoryResponseDto,
    description: 'Thông tin danh mục cha (null nếu là danh mục gốc)',
    required: false,
    nullable: true,
  })
  parent?: CategoryResponseDto | null;

  @ApiProperty({
    example: 1,
    description: 'Thứ tự ưu tiên hiển thị',
    default: 0,
  })
  display_order: number;

  @ApiProperty({
    type: () => [CategoryResponseDto],
    description: 'Danh sách các danh mục con',
    required: false,
  })
  children?: CategoryResponseDto[];

  @ApiProperty({ example: '2024-03-20T10:00:00Z', description: 'Ngày tạo' })
  created_at: Date;
}
