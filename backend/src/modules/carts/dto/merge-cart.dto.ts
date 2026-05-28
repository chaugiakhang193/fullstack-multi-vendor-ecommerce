import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CART_LIMITS } from '@/common/constants/cart.constant';

export class GuestCartItemDto {
  @ApiProperty({
    description: 'ID sản phẩm',
    example: 'd0b8f418-2e8f-4cb1-8cb5-4cfeb9d701e6',
  })
  @IsUUID()
  @IsNotEmpty()
  product_id: string;

  @ApiPropertyOptional({
    description: 'ID biến thể (nếu có)',
    example: 'a0b9f418-2e8f-4cb1-8cb5-4cfeb9d701e7',
  })
  @IsUUID()
  @IsOptional()
  variant_id?: string;

  @ApiProperty({
    description: 'Số lượng mua',
    minimum: CART_LIMITS.MIN_QUANTITY_PER_ITEM,
    maximum: CART_LIMITS.MAX_QUANTITY_PER_ITEM,
    example: 2,
  })
  @IsInt()
  @Min(CART_LIMITS.MIN_QUANTITY_PER_ITEM)
  @Max(CART_LIMITS.MAX_QUANTITY_PER_ITEM)
  @Type(() => Number)
  quantity: number;
}

export class MergeCartDto {
  @ApiProperty({
    type: [GuestCartItemDto],
    description: 'Danh sách sản phẩm từ localStorage khách',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuestCartItemDto)
  items: GuestCartItemDto[];
}
