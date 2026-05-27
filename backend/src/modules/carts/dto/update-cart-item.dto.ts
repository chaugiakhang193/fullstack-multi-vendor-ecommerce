import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';
import { CART_LIMITS } from '@/common/constants/cart.constant';

export class UpdateCartItemDto {
  @ApiProperty({
    description: 'Số lượng mua mới',
    minimum: CART_LIMITS.MIN_QUANTITY_PER_ITEM,
    maximum: CART_LIMITS.MAX_QUANTITY_PER_ITEM,
    example: 5,
  })
  @IsInt()
  @Min(CART_LIMITS.MIN_QUANTITY_PER_ITEM)
  @Max(CART_LIMITS.MAX_QUANTITY_PER_ITEM)
  quantity: number;
}
