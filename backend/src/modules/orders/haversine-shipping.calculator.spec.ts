import { Test, TestingModule } from '@nestjs/testing';
import { HaversineShippingCalculator } from './haversine-shipping.calculator';
import { SHIPPING_CONSTANTS } from '@/common/constants/shipping.constants';
import { CalculateShippingFeeParams } from './shipping.interface';

describe('HaversineShippingCalculator', () => {
  let calculator: HaversineShippingCalculator;

  beforeEach(async () => {
    const testingModuleSpec = {
      providers: [HaversineShippingCalculator],
    };
    const module: TestingModule = await Test.createTestingModule(testingModuleSpec).compile();
    calculator = module.get<HaversineShippingCalculator>(HaversineShippingCalculator);
  });

  it('should be defined', () => {
    expect(calculator).toBeDefined();
  });

  describe('calculateShippingFee', () => {
    const shopVerified = {
      lat: '10.776889',
      lng: '106.700806',
      is_coordinates_verified: true,
    };

    it('should return 0 when subtotal qualifies for free shipping, even if shop is not verified or coordinates are missing', () => {
      // Cửa hàng chưa xác thực nhưng đơn hàng đủ điều kiện freeship
      const unverifiedShop = { ...shopVerified, is_coordinates_verified: false };
      const destCoords = { lat: '10.791550', lng: '106.721450' };
      const freeShippingThreshold = SHIPPING_CONSTANTS.FREE_SHIPPING_THRESHOLD;
      
      const params1: CalculateShippingFeeParams = {
        shop: unverifiedShop,
        destination: destCoords,
        subtotal: freeShippingThreshold,
      };
      
      const result1 = calculator.calculateShippingFee(params1);
      expect(result1).toBe(0);

      // Thiếu tọa độ hoàn toàn nhưng đơn hàng đủ điều kiện freeship
      const emptyShopCoords = { lat: null, lng: null, is_coordinates_verified: true };
      const emptyDestCoords = { lat: null, lng: undefined };
      const subtotalOverThreshold = freeShippingThreshold + 10000;
      
      const params2: CalculateShippingFeeParams = {
        shop: emptyShopCoords,
        destination: emptyDestCoords,
        subtotal: subtotalOverThreshold,
      };
      
      const result2 = calculator.calculateShippingFee(params2);
      expect(result2).toBe(0);
    });

    it('should return FALLBACK_FEE when shop or destination object is missing', () => {
      const fallbackFee = SHIPPING_CONSTANTS.FALLBACK_FEE;

      const paramsNullDest: CalculateShippingFeeParams = {
        shop: shopVerified,
        destination: null as any,
        subtotal: 100000,
      };
      
      const resultNullDest = calculator.calculateShippingFee(paramsNullDest);
      expect(resultNullDest).toBe(fallbackFee);

      const paramsNullShop: CalculateShippingFeeParams = {
        shop: null as any,
        destination: { lat: '10.776889', lng: '106.700806' },
        subtotal: 100000,
      };
      
      const resultNullShop = calculator.calculateShippingFee(paramsNullShop);
      expect(resultNullShop).toBe(fallbackFee);
    });

    it('should return FALLBACK_FEE when shop is not verified', () => {
      const fallbackFee = SHIPPING_CONSTANTS.FALLBACK_FEE;
      const unverifiedShop = { ...shopVerified, is_coordinates_verified: false };
      const destCoords = { lat: '10.791550', lng: '106.721450' };
      
      const params: CalculateShippingFeeParams = {
        shop: unverifiedShop,
        destination: destCoords,
        subtotal: 100000,
      };
      
      const result = calculator.calculateShippingFee(params);
      expect(result).toBe(fallbackFee);
    });

    it('should return FALLBACK_FEE when coordinates parse to NaN', () => {
      const fallbackFee = SHIPPING_CONSTANTS.FALLBACK_FEE;
      const destCoords = { lat: '10.791550', lng: '106.721450' };

      const paramsEmpty: CalculateShippingFeeParams = {
        shop: { ...shopVerified, lat: '' },
        destination: destCoords,
        subtotal: 100000,
      };
      const resultEmpty = calculator.calculateShippingFee(paramsEmpty);
      expect(resultEmpty).toBe(fallbackFee);

      const paramsNullCoords: CalculateShippingFeeParams = {
        shop: { ...shopVerified, lat: null },
        destination: { lat: null, lng: '106.721450' },
        subtotal: 100000,
      };
      const resultNullCoords = calculator.calculateShippingFee(paramsNullCoords);
      expect(resultNullCoords).toBe(fallbackFee);

      const paramsGarbage: CalculateShippingFeeParams = {
        shop: shopVerified,
        destination: { lat: 'invalid_number', lng: '106.721450' },
        subtotal: 100000,
      };
      const resultGarbage = calculator.calculateShippingFee(paramsGarbage);
      expect(resultGarbage).toBe(fallbackFee);
    });

    it('should return FALLBACK_FEE when coordinates are out of valid range', () => {
      const fallbackFee = SHIPPING_CONSTANTS.FALLBACK_FEE;
      const destCoords = { lat: '10.791550', lng: '106.721450' };

      const paramsInvalidLat: CalculateShippingFeeParams = {
        shop: { ...shopVerified, lat: '95' }, // lat > 90
        destination: destCoords,
        subtotal: 100000,
      };
      const resultInvalidLat = calculator.calculateShippingFee(paramsInvalidLat);
      expect(resultInvalidLat).toBe(fallbackFee);

      const paramsInvalidLng: CalculateShippingFeeParams = {
        shop: shopVerified,
        destination: { lat: '10.791550', lng: '-185' }, // lng < -180
        subtotal: 100000,
      };
      const resultInvalidLng = calculator.calculateShippingFee(paramsInvalidLng);
      expect(resultInvalidLng).toBe(fallbackFee);
    });

    it('should return BASE_FEE for short distances (<= 2km after correction)', () => {
      const baseFee = SHIPPING_CONSTANTS.BASE_FEE;
      const destCoords = { lat: '10.773889', lng: '106.697806' }; // ~0.61km corrected distance
      
      const params: CalculateShippingFeeParams = {
        shop: shopVerified,
        destination: destCoords,
        subtotal: 100000,
      };
      
      const result = calculator.calculateShippingFee(params);
      expect(result).toBe(baseFee);
    });

    it('should return BASE_FEE when coordinates are identical (distance = 0)', () => {
      const baseFee = SHIPPING_CONSTANTS.BASE_FEE;
      const destCoords = { lat: '10.776889', lng: '106.700806' };
      
      const params: CalculateShippingFeeParams = {
        shop: shopVerified,
        destination: destCoords,
        subtotal: 100000,
      };
      
      const result = calculator.calculateShippingFee(params);
      expect(result).toBe(baseFee);
    });

    it('should calculate dynamically and round to the nearest thousand for longer distances (> 2km)', () => {
      const destCoords = { lat: '10.791550', lng: '106.721450' }; // ~3.617km corrected distance
      
      const params: CalculateShippingFeeParams = {
        shop: shopVerified,
        destination: destCoords,
        subtotal: 100000,
      };
      
      const result = calculator.calculateShippingFee(params);
      expect(result).toBe(20000);
    });

    it('should cap the shipping fee at MAX_SHIPPING_FEE for extremely long distances', () => {
      const maxShippingFee = SHIPPING_CONSTANTS.MAX_SHIPPING_FEE;
      const destCoords = { lat: '21.028511', lng: '105.804817' }; // Hanoi
      
      const params: CalculateShippingFeeParams = {
        shop: shopVerified,
        destination: destCoords,
        subtotal: 100000,
      };
      
      const result = calculator.calculateShippingFee(params);
      expect(result).toBe(maxShippingFee);
    });

    it('should always return a fee that is a multiple of 1,000', () => {
      const testCoordinates = [
        { lat: '10.78', lng: '106.71' },
        { lat: '10.82', lng: '106.63' },
        { lat: '10.75', lng: '106.68' },
        { lat: '10.85', lng: '106.81' },
        { lat: '10.80', lng: '106.75' },
      ];

      for (const coords of testCoordinates) {
        const params: CalculateShippingFeeParams = {
          shop: shopVerified,
          destination: coords,
          subtotal: 120000,
        };
        
        const fee = calculator.calculateShippingFee(params);
        const feeModulo = fee % 1000;
        expect(feeModulo).toBe(0);
      }
    });
  });
});
