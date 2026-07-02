import {
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Min,
  MinLength,
  MaxLength,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ReturnReason } from '@/common/enums';
import { RETURN_LIMITS } from '@/common/limits';

export class ReturnItemInputDto {
  @ApiProperty({ description: 'UUID của order_item cần trả' })
  @IsUUID()
  orderItemId: string;

  @ApiProperty({
    description: 'Số lượng trả (>=1, <= số chưa trả)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateReturnRequestDto {
  @ApiProperty({ description: 'UUID sub-order (đơn con của 1 shop) cần trả' })
  @IsUUID()
  subOrderId: string;

  @ApiProperty({ enum: ReturnReason })
  @IsEnum(ReturnReason)
  reason: ReturnReason;

  @ApiProperty({ description: 'Ghi chú lý do của khách (bắt buộc)' })
  @IsString()
  @MinLength(RETURN_LIMITS.NOTE_MIN_LENGTH)
  @MaxLength(RETURN_LIMITS.NOTE_MAX_LENGTH)
  customerNote: string;

  @ApiProperty({ type: [ReturnItemInputDto] })
  @IsArray()
  @ArrayMinSize(RETURN_LIMITS.MIN_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemInputDto)
  items: ReturnItemInputDto[];
}
