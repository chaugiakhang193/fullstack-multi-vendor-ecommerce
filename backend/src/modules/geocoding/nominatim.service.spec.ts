// Services
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NominatimService, AutocompleteResult } from './nominatim.service';

describe('NominatimService', () => {
  let service: NominatimService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        const nominatimApiUrlEnv = 'NOMINATIM_API_URL';
        const nominatimEmailEnv = 'NOMINATIM_EMAIL';
        const nominatimUserAgentEnv = 'NOMINATIM_USER_AGENT';
        const fallbackGeocodingProviderEnv = 'FALLBACK_GEOCODING_PROVIDER';
        const fallbackGeocodingApiUrlEnv = 'FALLBACK_GEOCODING_API_URL';
        const fallbackGeocodingApiKeyEnv = 'FALLBACK_GEOCODING_API_KEY';
        const locationiqApiKeyEnv = 'LOCATIONIQ_API_KEY';
        const locationiqAutocompleteUrlEnv = 'LOCATIONIQ_AUTOCOMPLETE_URL';

        if (key === nominatimApiUrlEnv) {
          const val = 'https://nominatim.openstreetmap.org/search';
          return val;
        }
        if (key === nominatimEmailEnv) {
          const val = 'test@example.com';
          return val;
        }
        if (key === nominatimUserAgentEnv) {
          const val = 'TestAgent/1.0 (test@example.com)';
          return val;
        }
        if (key === fallbackGeocodingProviderEnv) {
          const val = 'goong';
          return val;
        }
        if (key === fallbackGeocodingApiUrlEnv) {
          const val = 'https://rsapi.goong.io/Geocode';
          return val;
        }
        if (key === fallbackGeocodingApiKeyEnv) {
          const val = 'test_fallback_key';
          return val;
        }
        if (key === locationiqApiKeyEnv) {
          const val = 'test_locationiq_key';
          return val;
        }
        if (key === locationiqAutocompleteUrlEnv) {
          const val = 'https://api.locationiq.com/v1/autocomplete';
          return val;
        }
        return null;
      }),
    };

    const moduleFixture = {
      providers: [
        NominatimService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    };

    const module: TestingModule =
      await Test.createTestingModule(moduleFixture).compile();
    service = module.get<NominatimService>(NominatimService);

    // Mock global fetch
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('should normalize address correctly', () => {
    const address = '   Quận 1,   TP.HCM!  ';
    const normalized = service.normalizeAddress(address);
    const expected = 'quận 1, tp.hcm';
    expect(normalized).toBe(expected);
  });

  it('should successfully geocode from Nominatim and cache the result', async () => {
    const mockResponseData = [
      {
        lat: '21.0285',
        lon: '105.8542',
      },
    ];

    const mockResponse = {
      ok: true,
      status: 200,
      json: jest.fn(() => {
        return Promise.resolve(mockResponseData);
      }),
    } as unknown as Response;

    fetchSpy.mockResolvedValue(mockResponse);

    const address = 'Hà Nội';
    const result = await service.geocode(address);

    const expected = {
      lat: 21.0285,
      lng: 105.8542,
      success: true,
    };
    expect(result).toEqual(expected);

    // Second call should hit cache and not call fetch
    const secondResult = await service.geocode(address);
    expect(secondResult).toEqual(expected);

    const expectedCallCount = 1;
    expect(fetchSpy).toHaveBeenCalledTimes(expectedCallCount);
  });

  it('should fall back to Goong API if Nominatim fails', async () => {
    const mockNominatimFailResponse = {
      ok: false,
      status: 429,
    } as Response;

    const mockGoongResponseData = {
      results: [
        {
          geometry: {
            location: {
              lat: '10.7769',
              lng: '106.7009',
            },
          },
        },
      ],
    };

    const mockGoongSuccessResponse = {
      ok: true,
      status: 200,
      json: jest.fn(() => {
        return Promise.resolve(mockGoongResponseData);
      }),
    } as unknown as Response;

    // First call fails, second call (fallback) succeeds
    fetchSpy
      .mockResolvedValueOnce(mockNominatimFailResponse)
      .mockResolvedValueOnce(mockGoongSuccessResponse);

    const address = 'Hồ Chí Minh';
    const result = await service.geocode(address);

    const expected = {
      lat: 10.7769,
      lng: 106.7009,
      success: true,
    };
    expect(result).toEqual(expected);

    const expectedCallCount = 2;
    expect(fetchSpy).toHaveBeenCalledTimes(expectedCallCount);
  });

  it('should return success: false gracefully if both APIs fail', async () => {
    const mockNominatimFailResponse = {
      ok: false,
      status: 500,
    } as Response;

    const mockGoongFailResponse = {
      ok: false,
      status: 500,
    } as Response;

    fetchSpy
      .mockResolvedValueOnce(mockNominatimFailResponse)
      .mockResolvedValueOnce(mockGoongFailResponse);

    const address = 'Đà Nẵng';
    const result = await service.geocode(address);

    const expected = {
      lat: null,
      lng: null,
      success: false,
    };
    expect(result).toEqual(expected);

    const expectedCallCount = 2;
    expect(fetchSpy).toHaveBeenCalledTimes(expectedCallCount);
  });

  describe('autocomplete', () => {
    const okResponse = (body: unknown): Response => {
      const responseObj = {
        ok: true,
        status: 200,
        json: async () => {
          return body;
        },
      };
      const responseCast = responseObj as Response;
      return responseCast;
    };

    const testTitle1 = 'trả mảng rỗng khi query ngắn hơn 3 ký tự (không gọi fetch)';
    it(testTitle1, async () => {
      const testQuery = 'ab';
      const result = await service.autocomplete(testQuery);
      const expectedEmpty: AutocompleteResult[] = [];
      expect(result).toEqual(expectedEmpty);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    const testTitle2 = 'map kết quả LocationIQ (primary) thành AutocompleteResult';
    it(testTitle2, async () => {
      const mockResultData = [
        {
          place_id: '12345',
          display_name: '450 Phan Xích Long, Phú Nhuận, TP.HCM',
          lat: '10.799',
          lon: '106.689',
        },
      ];
      const mockOkRes = okResponse(mockResultData);
      fetchSpy.mockResolvedValueOnce(mockOkRes);

      const testQuery = '450 Phan Xich Long';
      const result = await service.autocomplete(testQuery);

      const callCount = 1;
      expect(fetchSpy).toHaveBeenCalledTimes(callCount);
      
      const firstCall = fetchSpy.mock.calls[0];
      const firstCallArg = firstCall[0];
      const calledUrl = firstCallArg.toString();
      
      const searchStrLocationIq = 'api.locationiq.com';
      const searchStrKey = 'key=test_locationiq_key';
      const searchStrLang = 'accept-language=vi';
      
      expect(calledUrl).toContain(searchStrLocationIq);
      expect(calledUrl).toContain(searchStrKey);
      expect(calledUrl).toContain(searchStrLang);
      
      const expectedAutocompleteResult = [
        {
          place_id: 12345,
          display_name: '450 Phan Xích Long, Phú Nhuận, TP.HCM',
          lat: '10.799',
          lon: '106.689',
        },
      ];
      expect(result).toEqual(expectedAutocompleteResult);
    });

    const testTitle3 = 'fallback sang Nominatim khi LocationIQ lỗi';
    it(testTitle3, async () => {
      const mockLocationIqFailResponse = {
        ok: false,
        status: 429,
      } as Response;

      const mockNominatimResultData = [
        {
          place_id: 999,
          display_name: 'Phan Xích Long, HCM',
          lat: '10.8',
          lon: '106.7',
        },
      ];
      const mockNominatimRes = okResponse(mockNominatimResultData);

      fetchSpy
        .mockResolvedValueOnce(mockLocationIqFailResponse)
        .mockResolvedValueOnce(mockNominatimRes);

      const testQuery = 'phan xich long';
      const result = await service.autocomplete(testQuery);

      const callCount = 2;
      expect(fetchSpy).toHaveBeenCalledTimes(callCount);
      
      const secondCall = fetchSpy.mock.calls[1];
      const secondCallArg = secondCall[0];
      const secondUrl = secondCallArg.toString();
      
      const searchStrNominatim = 'nominatim';
      expect(secondUrl).toContain(searchStrNominatim);
      
      const expectedLen = 1;
      expect(result).toHaveLength(expectedLen);
      
      const firstItem = result[0];
      const firstItemId = firstItem.place_id;
      const expectedId = 999;
      expect(firstItemId).toBe(expectedId);
    });

    const testTitle4 = 'dùng cache cho query trùng (không gọi fetch lần 2)';
    it(testTitle4, async () => {
      const mockResultData = [
        {
          place_id: 1,
          display_name: 'Nguyễn Huệ, Q1',
          lat: '10.77',
          lon: '106.70',
        },
      ];
      const mockOkRes = okResponse(mockResultData);
      fetchSpy.mockResolvedValueOnce(mockOkRes);

      const testQuery = 'nguyen hue q1';
      await service.autocomplete(testQuery);
      await service.autocomplete(testQuery); // hit cache

      const callCount = 1;
      expect(fetchSpy).toHaveBeenCalledTimes(callCount);
    });
  });
});
