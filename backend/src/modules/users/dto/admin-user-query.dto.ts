import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { UserRole, AccountStatus } from '@/common/enums';

export class AdminUserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: UserRole, description: 'Lọc theo vai trò' })
  @IsOptional()
  @IsEnum(UserRole, { message: 'Vai trò không hợp lệ' })
  role?: UserRole;

  @ApiPropertyOptional({ enum: AccountStatus, description: 'Lọc theo trạng thái' })
  @IsOptional()
  @IsEnum(AccountStatus, { message: 'Trạng thái không hợp lệ' })
  status?: AccountStatus;

  @ApiPropertyOptional({ description: 'Tìm theo username hoặc email' })
  @IsOptional()
  @IsString()
  search?: string;
}
