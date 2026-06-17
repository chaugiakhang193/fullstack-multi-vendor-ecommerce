import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ description: 'ID của order_item (lần mua) muốn đánh giá' })
  @IsUUID()
  order_item_id: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
