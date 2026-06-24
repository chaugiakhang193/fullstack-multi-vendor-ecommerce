import { SHIPPING_LIMITS } from '@/common/limits';

/**
 * Shipping Fee Constants
 * Used by the Haversine Shipping Calculator to determine shipping charges dynamically.
 */
export const SHIPPING_CONSTANTS = {
  /**
   * Base shipping fee (VND) for the initial distance.
   * Currently set to 15,000 VND.
   */
  BASE_FEE: 15000,

  /**
   * Additional rate per kilometer (VND/km) beyond the base distance.
   * Currently set to 3,000 VND/km.
   */
  RATE_PER_KM: 3000,

  /**
   * Base distance in kilometers (km) covered by the base fee.
   * Currently set to 2 km.
   */
  BASE_DISTANCE_KM: 2,

  /**
   * Threshold in VND above which shipping is free per shop.
   * If the shop's subtotal is >= 500,000 VND, the shipping fee is waived.
   */
  FREE_SHIPPING_THRESHOLD: SHIPPING_LIMITS.FREE_SHIPPING_THRESHOLD,

  /**
   * Maximum shipping fee ceiling (VND) to prevent excessive shipping costs.
   * Cap is set at 150,000 VND.
   */
  MAX_SHIPPING_FEE: 150000,

  /**
   * Distance correction factor to approximate actual driving distance from a straight line.
   * Factor is 1.3 (e.g., straight-line 10km becomes approx 13km road distance).
   */
  DISTANCE_CORRECTION_FACTOR: 1.3,

  /**
   * Fallback shipping fee (VND) returned when coordinates are invalid or verification fails.
   * Fallback is 30,000 VND.
   */
  FALLBACK_FEE: 30000,

  /**
   * Earth's mean radius in kilometers.
   */
  EARTH_RADIUS_KM: 6371,

  /**
   * Minimum valid latitude value.
   */
  MIN_LATITUDE: -90,

  /**
   * Maximum valid latitude value.
   */
  MAX_LATITUDE: 90,

  /**
   * Minimum valid longitude value.
   */
  MIN_LONGITUDE: -180,

  /**
   * Maximum valid longitude value.
   */
  MAX_LONGITUDE: 180,

  /**
   * Rounding factor for shipping fee in VND.
   */
  ROUNDING_FACTOR: 1000,
};
