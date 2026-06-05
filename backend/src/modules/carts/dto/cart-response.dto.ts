import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus, CartItemUnavailableReason } from '@/common/enums';

export class CartItemProductDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty({ type: Number }) price: number;
  @ApiProperty({ nullable: true }) thumbnail_url: string | null;
  @ApiProperty() is_hidden: boolean;
  @ApiProperty({ enum: ProductStatus }) status: ProductStatus;
}

export class CartItemVariantDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: Number }) additional_price: number;
  @ApiProperty({ type: [String], nullable: true }) images: string[] | null;
}

export class CartItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: CartItemProductDto }) product: CartItemProductDto;
  @ApiProperty({ type: CartItemVariantDto, nullable: true })
  variant: CartItemVariantDto | null;
  @ApiProperty() quantity: number;
  @ApiProperty({ type: Number }) unit_price: number;
  @ApiProperty({ type: Number }) subtotal: number;
  @ApiProperty() added_at: Date;
  @ApiProperty() available_stock: number;
  @ApiProperty() is_available: boolean;
  @ApiPropertyOptional({ enum: CartItemUnavailableReason })
  reason?: CartItemUnavailableReason;
}

export class CartShopDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) logo_url: string | null;
}

export class CartShopGroupDto {
  @ApiProperty({ type: CartShopDto }) shop: CartShopDto;
  @ApiProperty({ type: [CartItemResponseDto] }) items: CartItemResponseDto[];
  @ApiProperty({ type: Number }) shop_subtotal: number;
}

export class CartResponseDto {
  @ApiProperty({ type: [CartShopGroupDto] }) items_by_shop: CartShopGroupDto[];
  @ApiProperty() total_items: number;
  @ApiProperty() total_quantity: number;
  @ApiProperty({ type: Number }) total_amount: number;
}
