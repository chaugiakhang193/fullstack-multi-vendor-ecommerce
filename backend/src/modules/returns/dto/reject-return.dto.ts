import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RETURN_LIMITS } from '@/common/limits';

export class RejectReturnDto {
  @ApiProperty({ description: 'Lý do từ chối của seller (bắt buộc)' })
  @IsString()
  @MinLength(RETURN_LIMITS.SELLER_NOTE_MIN_LENGTH)
  @MaxLength(RETURN_LIMITS.SELLER_NOTE_MAX_LENGTH)
  sellerNote: string;
}
