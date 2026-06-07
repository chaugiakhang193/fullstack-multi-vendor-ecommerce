// Services
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NominatimService } from './nominatim.service';

describe('NominatimService', () => {
  let service: NominatimService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'NOMINATIM_API_URL') {
          return 'https://nominatim.openstreetmap.org/search';
        }
        if (key === 'NOMINATIM_EMAIL') {
          return 'test@example.com';
        }
        if (key === 'NOMINATIM_USER_AGENT') {
          return 'TestAgent/1.0 (test@example.com)';
        }
        if (key === 'FALLBACK_GEOCODING_PROVIDER') {
          return 'goong';
        }
        if (key === 'FALLBACK_GEOCODING_API_URL') {
          return 'https://rsapi.goong.io/Geocode';
        }
        if (key === 'FALLBACK_GEOCODING_API_KEY') {
          return 'test_fallback_key';
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
});
