import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@/common/enums';
import { ShippingAddressSnapshot } from '@/modules/orders/shipping.interface';

export class CheckoutResponseItemDto {
  @ApiProperty({
    example: 'd1b85fb4-3449-45cf-a407-d26b808a55b8',
    description: 'ID sản phẩm',
  })
  product_id: string;

  @ApiProperty({
    example: 'Áo thun basic',
    description: 'Tên sản phẩm tại thời điểm mua',
  })
  product_name: string;

  @ApiProperty({
    example: 'abc12345-0000-0000-0000-000000000001',
    nullable: true,
    description: 'ID biến thể (null nếu không có biến thể)',
  })
  variant_id: string | null;

  @ApiProperty({
    example: 'Size M / Màu Đen',
    nullable: true,
    description: 'Tên biến thể (null nếu không có biến thể)',
  })
  variant_name: string | null;

  @ApiProperty({ example: 2, description: 'Số lượng' })
  quantity: number;

  @ApiProperty({ example: 199000, description: 'Giá tại thời điểm mua (VNĐ)' })
  price_at_purchase: number;
}

export class ShippingAddressSnapshotDto implements ShippingAddressSnapshot {
  @ApiProperty({ example: 'Nguyễn Văn A', description: 'Tên người nhận' })
  recipient_name: string;

  @ApiProperty({
    example: '0901234567',
    description: 'Số điện thoại người nhận',
  })
  phone: string;

  @ApiProperty({
    example: '135 Nguyễn Huệ, Bến Nghé, Quận 1, TP.HCM',
    description: 'Địa chỉ giao hàng',
  })
  address_line: string;

  @ApiProperty({ example: 10.777353, nullable: true, description: 'Vĩ độ' })
  lat: number | null;

  @ApiProperty({ example: 106.698089, nullable: true, description: 'Kinh độ' })
  lng: number | null;
}

export class CheckoutResponseSubOrderDto {
  @ApiProperty({
    example: 'e5f6a7b8-1234-5678-abcd-000000000001',
    description: 'ID sub-order',
  })
  sub_order_id: string;

  @ApiProperty({
    example: 'd1b85fb4-3449-45cf-a407-d26b808a55b8',
    description: 'ID shop',
  })
  shop_id: string;

  @ApiProperty({ example: 'Shop ABC', description: 'Tên shop' })
  shop_name: string;

  @ApiProperty({
    example: 398000,
    description: 'Tổng tiền hàng của shop (chưa trừ giảm giá, chưa cộng ship)',
  })
  sub_total: number;

  @ApiProperty({ example: 30000, description: 'Phí vận chuyển' })
  shipping_fee: number;

  @ApiProperty({
    example: 40000,
    description: 'Số tiền giảm giá từ coupon shop',
  })
  discount_amount: number;

  @ApiProperty({
    example: 'SHOPVOUCHER10',
    nullable: true,
    description: 'Mã giảm giá của shop đã dùng',
  })
  shop_coupon_code: string | null;

  @ApiProperty({
    example: 388000,
    description: 'Tổng tiền sub-order (sub_total - discount + shipping_fee)',
  })
  total_amount: number;

  @ApiProperty({
    type: [CheckoutResponseItemDto],
    description: 'Danh sách sản phẩm trong sub-order',
  })
  items: CheckoutResponseItemDto[];
}

export class CheckoutResponseDto {
  @ApiProperty({
    example: 'a1b2c3d4-0000-0000-0000-000000000001',
    description: 'ID đơn hàng',
  })
  order_id: string;

  @ApiProperty({
    example: '#ORD-20260609-AB12CD',
    description: 'Mã đơn hàng hiển thị',
  })
  order_number: string;

  @ApiProperty({
    example: 388000,
    description: 'Tổng tiền toàn đơn (sau tất cả giảm giá)',
  })
  total_amount: number;

  @ApiProperty({
    example: 50000,
    nullable: true,
    description: 'Số tiền giảm giá toàn sàn (từ voucher admin)',
  })
  global_discount_amount: number | null;

  @ApiProperty({
    example: 'GLOBAL2026',
    nullable: true,
    description: 'Mã giảm giá toàn sàn',
  })
  global_coupon_code: string | null;

  @ApiProperty({
    enum: PaymentMethod,
    example: PaymentMethod.COD,
    description: 'Phương thức thanh toán',
  })
  payment_method: PaymentMethod;

  @ApiProperty({
    type: ShippingAddressSnapshotDto,
    description: 'Snapshot địa chỉ giao hàng tại thời điểm đặt',
  })
  shipping_address: ShippingAddressSnapshotDto;

  @ApiProperty({
    type: [CheckoutResponseSubOrderDto],
    description: 'Danh sách sub-order theo từng shop',
  })
  sub_orders: CheckoutResponseSubOrderDto[];

  @ApiProperty({
    example: '2026-06-09T01:24:50.993Z',
    description: 'Thời điểm tạo đơn',
  })
  created_at: Date;
}
