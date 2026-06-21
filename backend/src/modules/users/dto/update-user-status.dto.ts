import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { AccountStatus } from '@/common/enums';

// Admin chỉ được set 3 trạng thái này (không dùng tay set pending/rejected)
const ADMIN_SETTABLE_STATUSES = [
  AccountStatus.ACTIVE,
  AccountStatus.SUSPENDED,
  AccountStatus.BANNED,
];

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: ADMIN_SETTABLE_STATUSES,
    description: 'Trạng thái mới (chỉ active | suspended | banned)',
  })
  @IsIn(ADMIN_SETTABLE_STATUSES, {
    message: 'Trạng thái chỉ được là active, suspended hoặc banned',
  })
  status: AccountStatus;
}
