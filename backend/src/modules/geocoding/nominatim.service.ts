// Services
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GeocodeResult {
  lat: number | null;
  lng: number | null;
  success: boolean;
}

export interface IGeocodingCache {
  get(key: string): Promise<GeocodeResult | null>;
  set(key: string, value: GeocodeResult, ttlMs: number): Promise<void>;
}

interface NominatimResponseItem {
  lat: string;
  lon: string;
}

interface GoongLocation {
  lat: string;
  lng: string;
}

interface GoongResult {
  geometry: {
    location: GoongLocation;
  };
}

interface GoongResponse {
  results: GoongResult[];
}

interface GenericOsmItem {
  lat: string;
  lon: string;
}

interface GenericOpenCageItem {
  geometry: {
    lat: string;
    lng: string;
  };
}

interface GenericFallbackResponse {
  results?: GenericOpenCageItem[];
}

// Lớp Cache trong bộ nhớ (In-Memory)
export class InMemoryGeocodingCache implements IGeocodingCache {
  private readonly store = new Map<
    string,
    { data: GeocodeResult; expiry: number }
  >();

  get(key: string): Promise<GeocodeResult | null> {
    const entry = this.store.get(key);
    if (!entry) {
      const nullResult = Promise.resolve(null);
      return nullResult;
    }
    const expiry = entry.expiry;
    const now = Date.now();
    if (expiry < now) {
      const cacheKeyToDelete = key;
      this.store.delete(cacheKeyToDelete);
      const nullResult = Promise.resolve(null);
      return nullResult;
    }
    const data = entry.data;
    const dataResult = Promise.resolve(data);
    return dataResult;
  }

  set(key: string, value: GeocodeResult, ttlMs: number): Promise<void> {
    const now = Date.now();
    const expiry = now + ttlMs;
    const entry = {
      data: value,
      expiry: expiry,
    };
    const cacheKeyToSet = key;
    this.store.set(cacheKeyToSet, entry);
    const voidResult = Promise.resolve();
    return voidResult;
  }
}

@Injectable()
export class NominatimService {
  private readonly logger = new Logger(NominatimService.name);
  private readonly cache: IGeocodingCache = new InMemoryGeocodingCache();
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 giờ

  constructor(private readonly configService: ConfigService) {}

  // Hàm chuẩn hóa địa chỉ đầu vào
  normalizeAddress(address: string): string {
    if (!address) {
      return '';
    }
    const normalized = address
      .toLowerCase()
      .trim()
      .replace(/[\s]+/g, ' ')
      .replace(
        /[^\w\spqdđỳýỷỹỵùúủũụưừứửữựòóỏõọôồốổỗộơờớởỡợèéẻẽẹêềếểễệìíỉĩịàáảãạâầấẩẫậăằắẳẵặ\-,./]/g,
        '',
      );
    return normalized;
  }

  async geocode(address: string): Promise<GeocodeResult> {
    const normalized = this.normalizeAddress(address);
    if (!normalized) {
      const invalidResult = { lat: null, lng: null, success: false };
      return invalidResult;
    }

    // 1. Kiểm tra cache
    const cacheKey = normalized;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      const debugMsg = `Cache hit cho địa chỉ: "${normalized}"`;
      this.logger.debug(debugMsg);
      return cached;
    }

    // 2. Gọi API chính: OSM Nominatim
    try {
      const result = await this.fetchFromNominatim(normalized);
      const ttl = this.CACHE_TTL_MS;
      await this.cache.set(normalized, result, ttl);
      return result;
    } catch (error) {
      const err = error as Error;
      const errorMsg = err.message;
      const warnMsg = `API chính Nominatim gặp lỗi cho "${normalized}": ${errorMsg}. Thử gọi API dự phòng...`;
      this.logger.warn(warnMsg);

      // 3. Gọi API dự phòng (Fallback)
      try {
        const result = await this.fetchFromFallback(normalized);
        const ttl = this.CACHE_TTL_MS;
        await this.cache.set(normalized, result, ttl);
        return result;
      } catch (fallbackError) {
        const fallbackErr = fallbackError as Error;
        const fallbackErrorMsg = fallbackErr.message;
        const errMsg = `API dự phòng cũng thất bại cho "${normalized}": ${fallbackErrorMsg}`;
        this.logger.error(errMsg);

        // Trả về kết quả đặc biệt để xử lý graceful degradation
        const fallbackFailResult = { lat: null, lng: null, success: false };
        return fallbackFailResult;
      }
    }
  }

  private async fetchFromNominatim(address: string): Promise<GeocodeResult> {
    const baseUrl =
      this.configService.get<string>('NOMINATIM_API_URL') ||
      'https://nominatim.openstreetmap.org/search';
    const email =
      this.configService.get<string>('NOMINATIM_EMAIL') || 'admin@example.com';
    const userAgent =
      this.configService.get<string>('NOMINATIM_USER_AGENT') ||
      `FullstackWeb/1.0 (${email})`;

    const url = new URL(baseUrl);
    url.searchParams.append('q', address);
    url.searchParams.append('format', 'json');
    url.searchParams.append('limit', '1');
    url.searchParams.append('countrycodes', 'vn');

    const timeoutMs = 5000;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const fetchUrlStr = url.toString();
    const headers = {
      'User-Agent': userAgent,
      Accept: 'application/json',
    };
    const response = await fetch(fetchUrlStr, {
      headers: headers,
      signal: timeoutSignal,
    });

    const isResponseOk = response.ok;
    if (!isResponseOk) {
      const responseStatus = response.status;
      const errorMsg = `Nominatim trả về mã trạng thái HTTP ${responseStatus}`;
      throw new Error(errorMsg);
    }

    const data = (await response.json()) as NominatimResponseItem[];
    const isDataArray = Array.isArray(data);
    const dataLength = data.length;
    if (!isDataArray || dataLength === 0) {
      const noResultsErrorMsg = 'Không tìm thấy kết quả từ Nominatim';
      throw new Error(noResultsErrorMsg);
    }

    const firstResult = data[0];
    const rawLat = firstResult.lat;
    const rawLon = firstResult.lon;
    const lat = parseFloat(rawLat);
    const lng = parseFloat(rawLon);

    const successResult = {
      lat: lat,
      lng: lng,
      success: true,
    };
    return successResult;
  }

  private async fetchFromFallback(address: string): Promise<GeocodeResult> {
    const provider = this.configService.get<string>(
      'FALLBACK_GEOCODING_PROVIDER',
    );
    const apiKey = this.configService.get<string>('FALLBACK_GEOCODING_API_KEY');
    const fallbackUrl = this.configService.get<string>(
      'FALLBACK_GEOCODING_API_URL',
    );

    if (!provider || !apiKey || (provider !== 'goong' && !fallbackUrl)) {
      const missingConfigMsg =
        'Chưa cấu hình API Key, Provider, hoặc URL dự phòng (Fallback)';
      throw new Error(missingConfigMsg);
    }

    if (provider === 'goong') {
      const defaultGoongUrl = 'https://rsapi.goong.io/Geocode';
      const actualGoongUrl = fallbackUrl || defaultGoongUrl;
      const url = new URL(actualGoongUrl);
      url.searchParams.append('address', address);
      url.searchParams.append('api_key', apiKey);

      const timeoutMs = 5000;
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const fetchUrlStr = url.toString();
      const response = await fetch(fetchUrlStr, {
        signal: timeoutSignal,
      });

      const isResponseOk = response.ok;
      if (!isResponseOk) {
        const responseStatus = response.status;
        const errorMsg = `Goong API trả về lỗi HTTP ${responseStatus}`;
        throw new Error(errorMsg);
      }

      const data = (await response.json()) as GoongResponse;
      const dataResults = data.results;
      const resultsLength = dataResults ? dataResults.length : 0;
      if (!dataResults || resultsLength === 0) {
        const noResultsErrorMsg = 'Không tìm thấy địa điểm trên Goong API';
        throw new Error(noResultsErrorMsg);
      }

      const firstResult = dataResults[0];
      const geometry = firstResult.geometry;
      const location = geometry.location;
      const rawLat = location.lat;
      const rawLng = location.lng;
      const lat = parseFloat(rawLat);
      const lng = parseFloat(rawLng);

      const successResult = {
        lat: lat,
        lng: lng,
        success: true,
      };
      return successResult;
    }

    const url = new URL(fallbackUrl!);
    url.searchParams.append('q', address);
    url.searchParams.append('key', apiKey);
    url.searchParams.append('format', 'json');
    url.searchParams.append('limit', '1');
    url.searchParams.append('countrycodes', 'vn');

    const timeoutMs = 5000;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const fetchUrlStr = url.toString();
    const response = await fetch(fetchUrlStr, {
      signal: timeoutSignal,
    });

    const isResponseOk = response.ok;
    if (!isResponseOk) {
      const responseStatus = response.status;
      const errorMsg = `Fallback API trả về lỗi HTTP ${responseStatus}`;
      throw new Error(errorMsg);
    }

    const data = (await response.json()) as unknown;
    const isDataArray = Array.isArray(data);
    if (isDataArray) {
      const genericOsmData = data as GenericOsmItem[];
      const dataLength = genericOsmData.length;
      if (dataLength > 0) {
        const firstResult = genericOsmData[0];
        const rawLat = firstResult.lat;
        const rawLon = firstResult.lon;
        const lat = parseFloat(rawLat);
        const lng = parseFloat(rawLon);

        const successResult = {
          lat: lat,
          lng: lng,
          success: true,
        };
        return successResult;
      }
    }

    const genericFallbackData = data as GenericFallbackResponse;
    const dataResults = genericFallbackData.results;
    const resultsLength = dataResults ? dataResults.length : 0;
    if (dataResults && resultsLength > 0) {
      const firstResult = dataResults[0];
      const geometry = firstResult.geometry;
      const rawLat = geometry.lat;
      const rawLng = geometry.lng;
      const lat = parseFloat(rawLat);
      const lng = parseFloat(rawLng);

      const successResult = {
        lat: lat,
        lng: lng,
        success: true,
      };
      return successResult;
    }

    const unsupportedFormatMsg =
      'Định dạng phản hồi API dự phòng không được hỗ trợ';
    throw new Error(unsupportedFormatMsg);
  }
}
