import { Injectable } from '@nestjs/common';
import { SHIPPING_CONSTANTS } from '@/common/constants/shipping.constants';
import {
  IShippingCalculator,
  CalculateShippingFeeParams,
} from './shipping.interface';

function isValidCoordinate(lat: number, lng: number): boolean {
  const isLatNaN = Number.isNaN(lat);
  const isLngNaN = Number.isNaN(lng);
  
  if (isLatNaN || isLngNaN) {
    return false;
  }
  
  const isLatValid = lat >= SHIPPING_CONSTANTS.MIN_LATITUDE && lat <= SHIPPING_CONSTANTS.MAX_LATITUDE;
  const isLngValid = lng >= SHIPPING_CONSTANTS.MIN_LONGITUDE && lng <= SHIPPING_CONSTANTS.MAX_LONGITUDE;
  
  return isLatValid && isLngValid;
}

@Injectable()
export class HaversineShippingCalculator implements IShippingCalculator {
  calculateShippingFee(params: CalculateShippingFeeParams): number {
    const { shop, destination, subtotal } = params;

    // Kiểm tra chính sách miễn phí vận chuyển trước tiên
    const freeShippingThreshold = SHIPPING_CONSTANTS.FREE_SHIPPING_THRESHOLD;
    if (subtotal >= freeShippingThreshold) {
      return 0;
    }

    // Kiểm tra phòng thủ xem đối tượng shop và destination có tồn tại hay không
    if (!shop || !destination) {
      return SHIPPING_CONSTANTS.FALLBACK_FEE;
    }

    // Kiểm tra xem cửa hàng đã được xác thực tọa độ chưa
    const isCoordinatesVerified = shop.is_coordinates_verified;
    if (isCoordinatesVerified !== true) {
      return SHIPPING_CONSTANTS.FALLBACK_FEE;
    }

    // Trích xuất và chuẩn hóa tọa độ cửa hàng
    const rawShopLat = shop.lat ?? '';
    const rawShopLng = shop.lng ?? '';
    const shopLat = parseFloat(rawShopLat);
    const shopLng = parseFloat(rawShopLng);

    // Trích xuất và chuẩn hóa tọa độ người nhận
    const rawDestLatVal = destination.lat;
    const rawDestLngVal = destination.lng;
    
    const destLatStr = typeof rawDestLatVal === 'number' 
      ? rawDestLatVal.toString() 
      : (rawDestLatVal ?? '');
    const destLngStr = typeof rawDestLngVal === 'number' 
      ? rawDestLngVal.toString() 
      : (rawDestLngVal ?? '');
      
    const destLat = parseFloat(destLatStr);
    const destLng = parseFloat(destLngStr);

    // Kiểm tra tính hợp lệ của tọa độ
    const isShopCoordsValid = isValidCoordinate(shopLat, shopLng);
    const isDestCoordsValid = isValidCoordinate(destLat, destLng);
    
    if (!isShopCoordsValid || !isDestCoordsValid) {
      return SHIPPING_CONSTANTS.FALLBACK_FEE;
    }

    // Tính toán khoảng cách theo công thức Haversine
    const diffLatDeg = destLat - shopLat;
    const diffLngDeg = destLng - shopLng;
    
    const diffLatRad = (diffLatDeg * Math.PI) / 180;
    const diffLngRad = (diffLngDeg * Math.PI) / 180;
    
    const shopLatRad = (shopLat * Math.PI) / 180;
    const destLatRad = (destLat * Math.PI) / 180;
    
    const halfDiffLatRad = diffLatRad / 2;
    const halfDiffLngRad = diffLngRad / 2;
    
    const sinHalfDiffLat = Math.sin(halfDiffLatRad);
    const sinHalfDiffLng = Math.sin(halfDiffLngRad);
    
    const cosShopLatRad = Math.cos(shopLatRad);
    const cosDestLatRad = Math.cos(destLatRad);
    
    const a =
      sinHalfDiffLat * sinHalfDiffLat +
      cosShopLatRad *
        cosDestLatRad *
        sinHalfDiffLng *
        sinHalfDiffLng;
        
    const sqrtA = Math.sqrt(a);
    const oneMinusA = 1 - a;
    const sqrtOneMinusA = Math.sqrt(oneMinusA);
    const c = 2 * Math.atan2(sqrtA, sqrtOneMinusA);
    const earthRadiusKm = SHIPPING_CONSTANTS.EARTH_RADIUS_KM;
    const rawDistance = earthRadiusKm * c;

    // Nhân hệ số hiệu chỉnh khoảng cách thực tế
    const distanceCorrectionFactor = SHIPPING_CONSTANTS.DISTANCE_CORRECTION_FACTOR;
    const correctedDistance = rawDistance * distanceCorrectionFactor;

    // Tính phí vận chuyển dựa trên khoảng cách
    let fee: number;
    const baseDistanceKm = SHIPPING_CONSTANTS.BASE_DISTANCE_KM;
    const baseFee = SHIPPING_CONSTANTS.BASE_FEE;
    const ratePerKm = SHIPPING_CONSTANTS.RATE_PER_KM;
    
    if (correctedDistance <= baseDistanceKm) {
      fee = baseFee;
    } else {
      const extraDistance = correctedDistance - baseDistanceKm;
      const extraFee = extraDistance * ratePerKm;
      fee = baseFee + extraFee;
    }

    // Giới hạn trần phí vận chuyển tối đa
    const maxShippingFee = SHIPPING_CONSTANTS.MAX_SHIPPING_FEE;
    fee = Math.min(fee, maxShippingFee);

    // Làm tròn phí vận chuyển đến hàng nghìn gần nhất
    const roundingFactor = SHIPPING_CONSTANTS.ROUNDING_FACTOR;
    const feeDividedByThousand = fee / roundingFactor;
    const roundedFeeUnit = Math.round(feeDividedByThousand);
    const finalFee = roundedFeeUnit * roundingFactor;

    return finalFee;
  }
}
