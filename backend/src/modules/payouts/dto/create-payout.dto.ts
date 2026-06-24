import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';
import { PAYOUT_LIMITS } from '@/common/limits';

export class CreatePayoutDto {
  @ApiProperty({ description: `Số tiền muốn rút (tối thiểu ${PAYOUT_LIMITS.MIN_AMOUNT}đ)`, example: 100000 })
  @IsNumber({}, { message: 'Số tiền rút phải là số.' })
  @Min(PAYOUT_LIMITS.MIN_AMOUNT, { message: `Số tiền rút tối thiểu là ${PAYOUT_LIMITS.MIN_AMOUNT}đ.` })
  amount: number;
}
