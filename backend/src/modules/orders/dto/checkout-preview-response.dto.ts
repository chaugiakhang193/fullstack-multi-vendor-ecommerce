import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PreviewItemDto {
  @ApiProperty() productId: string;
  @ApiPropertyOptional({ nullable: true }) variantId: string | null;
  @ApiProperty() productName: string;
  @ApiPropertyOptional({ nullable: true }) variantName: string | null;
  @ApiPropertyOptional({ nullable: true }) productThumbnail: string | null;
  @ApiProperty() price: number;
  @ApiProperty() quantity: number;
  @ApiPropertyOptional({
    nullable: true,
    description: '"Hết hàng" | "Chỉ còn X sản phẩm" | null',
  })
  stock_warning: string | null;
}

export class PreviewShopDto {
  @ApiProperty() shopId: string;
  @ApiProperty() shopName: string;
  @ApiProperty({ type: [PreviewItemDto] }) items: PreviewItemDto[];
  @ApiProperty() shippingFee: number;
  @ApiProperty() shopSubtotal: number;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Số tiền cần mua thêm để freeship (≤100k) hoặc null',
  })
  freeship_upsell_needed: number | null;
}

export class CheckoutPreviewResponseDto {
  @ApiProperty({ type: [PreviewShopDto] }) shops: PreviewShopDto[];
  @ApiProperty() totalShippingFee: number;
  @ApiProperty() totalDiscount: number;
  @ApiProperty() totalAmount: number;
}
