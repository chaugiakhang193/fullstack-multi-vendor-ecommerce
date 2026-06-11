// Kết quả geocode (địa chỉ → 1 toạ độ) trả về cho caller
export interface GeocodeResult {
  lat: number | null;
  lng: number | null;
  success: boolean;
}

// Abstraction cache cho geocode — cho phép thay InMemory bằng Redis sau này
export interface IGeocodingCache {
  get(key: string): Promise<GeocodeResult | null>;
  set(key: string, value: GeocodeResult, ttlMs: number): Promise<void>;
}

// Một item trong response /search của Nominatim
export interface NominatimResponseItem {
  lat: string;
  lon: string;
}

// Một gợi ý địa chỉ đã chuẩn hoá trả cho FE (nguồn: LocationIQ primary / Nominatim fallback)
export interface AutocompleteResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

// Item thô định dạng OSM (dùng chung cho LocationIQ /autocomplete và Nominatim /search)
export interface OsmAutocompleteItem {
  place_id: number | string;
  display_name: string;
  lat: string;
  lon: string;
}

// Các shape response của provider fallback geocode (Goong, OpenCage...)
export interface GoongLocation {
  lat: string;
  lng: string;
}

export interface GoongResult {
  geometry: {
    location: GoongLocation;
  };
}

export interface GoongResponse {
  results: GoongResult[];
}

export interface GenericOsmItem {
  lat: string;
  lon: string;
}

export interface GenericOpenCageItem {
  geometry: {
    lat: string;
    lng: string;
  };
}

export interface GenericFallbackResponse {
  results?: GenericOpenCageItem[];
}
