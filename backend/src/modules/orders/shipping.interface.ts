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
