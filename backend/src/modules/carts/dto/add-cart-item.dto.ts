import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty, IsInt, Min, Max, IsOptional } from 'class-validator';
import { CART_LIMITS } from '@/common/constants/cart.constant';

export class AddCartItemDto {
  @ApiProperty({ description: 'ID sản phẩm', example: 'd0b8f418-2e8f-4cb1-8cb5-4cfeb9d701e6' })
  @IsUUID()
  @IsNotEmpty()
  product_id: string;

  @ApiPropertyOptional({ description: 'ID biến thể (bắt buộc nếu sản phẩm có biến thể)', example: 'a0b9f418-2e8f-4cb1-8cb5-4cfeb9d701e7' })
  @IsUUID()
  @IsOptional()
  variant_id?: string;

  @ApiPropertyOptional({
    description: 'Số lượng mua',
    default: CART_LIMITS.MIN_QUANTITY_PER_ITEM,
    minimum: CART_LIMITS.MIN_QUANTITY_PER_ITEM,
    maximum: CART_LIMITS.MAX_QUANTITY_PER_ITEM,
  })
  @IsInt()
  @Min(CART_LIMITS.MIN_QUANTITY_PER_ITEM)
  @Max(CART_LIMITS.MAX_QUANTITY_PER_ITEM)
  @IsOptional()
  quantity?: number = CART_LIMITS.MIN_QUANTITY_PER_ITEM;
}
