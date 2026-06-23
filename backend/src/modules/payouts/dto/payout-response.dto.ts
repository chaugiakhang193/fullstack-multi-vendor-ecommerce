import { ApiProperty } from '@nestjs/swagger';
import { PayoutStatus } from '@/common/enums';

export class PayoutResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  commission_fee: number;

  @ApiProperty({ enum: PayoutStatus })
  status: PayoutStatus;

  @ApiProperty({ nullable: true })
  reject_reason: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  bank_info_snapshot: Record<string, any>;

  @ApiProperty({ nullable: true })
  resolved_at: Date | null;

  @ApiProperty()
  created_at: Date;
}
