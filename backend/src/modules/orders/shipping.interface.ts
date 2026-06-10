export interface Coordinate {
  lat: string | number | null | undefined;
  lng: string | number | null | undefined;
}

export interface ShopShippingInfo {
  lat: string | null;
  lng: string | null;
  is_coordinates_verified: boolean;
}

export interface CalculateShippingFeeParams {
  shop: ShopShippingInfo;
  destination: Coordinate;
  subtotal: number;
}

export interface IShippingCalculator {
  calculateShippingFee(params: CalculateShippingFeeParams): number;
}

// Snapshot địa chỉ giao hàng lưu vào order.shipping_address (jsonb) tại thời điểm checkout.
// Một nguồn sự thật cho shape này: cột entity, snapshotAddress(), buildCheckoutResponse(),
// createOrderWithRetry() và ShippingAddressSnapshotDto đều trỏ về đây thay vì khai báo inline.
// lat/lng đã parse sang number (Address lưu dạng string) — null nếu thiếu/không hợp lệ.
export interface ShippingAddressSnapshot {
  recipient_name: string;
  phone: string;
  address_line: string;
  lat: number | null;
  lng: number | null;
}
