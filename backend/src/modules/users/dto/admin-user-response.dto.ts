import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, AccountStatus } from '@/common/enums';

// Doc-only DTO cho Swagger (admin xem user). Service vẫn trả User entity thô;
// password đã select:false nên không bao giờ xuất hiện trong response.
export class AdminUserResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002' })
  id: string;

  @ApiProperty({ example: 'buyer01' })
  username: string;

  @ApiProperty({ example: 'buyer@example.com' })
  email: string;

  @ApiProperty({ enum: UserRole, example: UserRole.CUSTOMER })
  role: UserRole;

  @ApiProperty({ enum: AccountStatus, example: AccountStatus.ACTIVE })
  status: AccountStatus;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A', nullable: true })
  full_name: string | null;

  @ApiPropertyOptional({ example: '0901234567', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/demo/image/upload/avatar.jpg',
    nullable: true,
  })
  avatar_url: string | null;

  @ApiProperty({ example: '2026-06-20T10:00:00Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-06-21T11:00:00Z' })
  updated_at: Date;
}
