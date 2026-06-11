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

export interface AutocompleteResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface OsmAutocompleteItem {
  place_id: number | string;
  display_name: string;
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

  // Cache riêng cho autocomplete (mảng gợi ý) — tách khỏi cache geocode (1 toạ độ).
  private readonly autocompleteCache = new Map<
    string,
    { data: AutocompleteResult[]; expiry: number }
  >();
  private readonly AUTOCOMPLETE_TTL_MS = 60 * 60 * 1000; // 1 giờ
  private readonly AUTOCOMPLETE_MIN_LEN = 3;
  private readonly AUTOCOMPLETE_LIMIT = 5;

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

  // Gợi ý địa chỉ khi gõ: LocationIQ (primary) → Nominatim (fallback). Có cache + chặn query ngắn.
  async autocomplete(query: string): Promise<AutocompleteResult[]> {
    const normalized = this.normalizeAddress(query);
    const minLen = this.AUTOCOMPLETE_MIN_LEN;
    const isShortQuery = normalized.length < minLen;
    if (isShortQuery) {
      const emptyResult: AutocompleteResult[] = [];
      return emptyResult;
    }

    // Kiểm tra cache trước để tiết kiệm quota gọi API ngoài
    const cached = this.autocompleteCache.get(normalized);
    if (cached) {
      const cachedExpiry = cached.expiry;
      const now = Date.now();
      const isCacheValid = cachedExpiry > now;
      if (isCacheValid) {
        const logMsg = `Autocomplete cache hit: "${normalized}"`;
        this.logger.debug(logMsg);
        const cachedData = cached.data;
        return cachedData;
      }
    }

    let results: AutocompleteResult[] = [];
    try {
      results = await this.fetchAutocompleteFromLocationIQ(normalized);
    } catch (error) {
      const err = error as Error;
      const errMsg = err.message;
      const warnMsg = `LocationIQ autocomplete lỗi cho "${normalized}": ${errMsg}. Fallback Nominatim...`;
      this.logger.warn(warnMsg);
    }

    const resultsLen = results.length;
    const isResultsEmpty = resultsLen === 0;
    if (isResultsEmpty) {
      try {
        results = await this.fetchAutocompleteFromNominatim(normalized);
      } catch (fallbackError) {
        const fErr = fallbackError as Error;
        const fErrMsg = fErr.message;
        const errorMsg = `Nominatim autocomplete cũng thất bại cho "${normalized}": ${fErrMsg}`;
        this.logger.error(errorMsg);
        const fallbackEmptyResult: AutocompleteResult[] = [];
        results = fallbackEmptyResult;
      }
    }

    const nowForCache = Date.now();
    const ttlMs = this.AUTOCOMPLETE_TTL_MS;
    const expiryTime = nowForCache + ttlMs;
    const cacheEntry = {
      data: results,
      expiry: expiryTime,
    };
    this.autocompleteCache.set(normalized, cacheEntry);
    return results;
  }

  private async fetchAutocompleteFromLocationIQ(
    query: string,
  ): Promise<AutocompleteResult[]> {
    const locationIqApiKeyEnv = 'LOCATIONIQ_API_KEY';
    const apiKey = this.configService.get<string>(locationIqApiKeyEnv);
    const locationIqUrlEnv = 'LOCATIONIQ_AUTOCOMPLETE_URL';
    const defaultUrl = 'https://api.locationiq.com/v1/autocomplete';
    const baseUrl =
      this.configService.get<string>(locationIqUrlEnv) ||
      defaultUrl;

    if (!apiKey) {
      const missingKeyMsg = 'Chưa cấu hình LOCATIONIQ_API_KEY';
      throw new Error(missingKeyMsg);
    }

    const url = new URL(baseUrl);
    
    const paramKey = 'key';
    url.searchParams.append(paramKey, apiKey);
    
    const paramQ = 'q';
    url.searchParams.append(paramQ, query);
    
    const limitVal = this.AUTOCOMPLETE_LIMIT;
    const limitStr = String(limitVal);
    const paramLimit = 'limit';
    url.searchParams.append(paramLimit, limitStr);
    
    const countrycodesVal = 'vn';
    const paramCountrycodes = 'countrycodes';
    url.searchParams.append(paramCountrycodes, countrycodesVal);
    
    const acceptLanguageVal = 'vi';
    const paramAcceptLanguage = 'accept-language';
    url.searchParams.append(paramAcceptLanguage, acceptLanguageVal);
    
    const dedupeVal = '1';
    const paramDedupe = 'dedupe';
    url.searchParams.append(paramDedupe, dedupeVal);

    const timeoutVal = 5000;
    const timeoutSignal = AbortSignal.timeout(timeoutVal);
    
    const urlStr = url.toString();
    const headersObj = { Accept: 'application/json' };
    const fetchOptions = {
      headers: headersObj,
      signal: timeoutSignal,
    };
    const response = await fetch(urlStr, fetchOptions);

    const isResponseOk = response.ok;
    if (!isResponseOk) {
      const rawStatus = response.status;
      const statusStr = String(rawStatus);
      const errorMsg = `LocationIQ trả về HTTP ${statusStr}`;
      throw new Error(errorMsg);
    }

    const rawData = (await response.json()) as unknown;
    const mappedResult = this.mapOsmItems(rawData);
    return mappedResult;
  }

  private async fetchAutocompleteFromNominatim(
    query: string,
  ): Promise<AutocompleteResult[]> {
    const nominatimUrlEnv = 'NOMINATIM_API_URL';
    const defaultNominatimUrl = 'https://nominatim.openstreetmap.org/search';
    const baseUrl =
      this.configService.get<string>(nominatimUrlEnv) ||
      defaultNominatimUrl;
      
    const nominatimEmailEnv = 'NOMINATIM_EMAIL';
    const defaultEmail = 'admin@example.com';
    const email =
      this.configService.get<string>(nominatimEmailEnv) || defaultEmail;
      
    const nominatimUserAgentEnv = 'NOMINATIM_USER_AGENT';
    const defaultUserAgent = `FullstackWeb/1.0 (${email})`;
    const userAgent =
      this.configService.get<string>(nominatimUserAgentEnv) ||
      defaultUserAgent;

    const url = new URL(baseUrl);
    
    const paramQ = 'q';
    url.searchParams.append(paramQ, query);
    
    const formatVal = 'json';
    const paramFormat = 'format';
    url.searchParams.append(paramFormat, formatVal);
    
    const limitVal = this.AUTOCOMPLETE_LIMIT;
    const limitStr = String(limitVal);
    const paramLimit = 'limit';
    url.searchParams.append(paramLimit, limitStr);
    
    const countrycodesVal = 'vn';
    const paramCountrycodes = 'countrycodes';
    url.searchParams.append(paramCountrycodes, countrycodesVal);
    
    const acceptLanguageVal = 'vi';
    const paramAcceptLanguage = 'accept-language';
    url.searchParams.append(paramAcceptLanguage, acceptLanguageVal);

    const timeoutVal = 5000;
    const timeoutSignal = AbortSignal.timeout(timeoutVal);
    
    const urlStr = url.toString();
    const headersObj = { 'User-Agent': userAgent, Accept: 'application/json' };
    const fetchOptions = {
      headers: headersObj,
      signal: timeoutSignal,
    };
    const response = await fetch(urlStr, fetchOptions);

    const isResponseOk = response.ok;
    if (!isResponseOk) {
      const rawStatus = response.status;
      const statusStr = String(rawStatus);
      const errorMsg = `Nominatim trả về HTTP ${statusStr}`;
      throw new Error(errorMsg);
    }

    const rawData = (await response.json()) as unknown;
    const mappedResult = this.mapOsmItems(rawData);
    return mappedResult;
  }

  // Chuẩn hoá item OSM (LocationIQ & Nominatim cùng format) → AutocompleteResult.
  private mapOsmItems(data: unknown): AutocompleteResult[] {
    const isArr = Array.isArray(data);
    if (!isArr) {
      const emptyArr: AutocompleteResult[] = [];
      return emptyArr;
    }
    const items = data as OsmAutocompleteItem[];
    const filterFn = (it: OsmAutocompleteItem) => {
      const hasDisplayName = it && it.display_name;
      const hasLat = it && it.lat;
      const hasLon = it && it.lon;
      const isValid = hasDisplayName && hasLat && hasLon;
      return isValid;
    };
    const filteredItems = items.filter(filterFn);
    
    const mapFn = (it: OsmAutocompleteItem) => {
      const rawId = it.place_id;
      const idNum = Number(rawId);
      const itemResult = {
        place_id: idNum,
        display_name: it.display_name,
        lat: it.lat,
        lon: it.lon,
      };
      return itemResult;
    };
    const mapped = filteredItems.map(mapFn);
    return mapped;
  }
}
