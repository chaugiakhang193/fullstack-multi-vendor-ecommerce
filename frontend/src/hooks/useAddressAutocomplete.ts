import { useState, useEffect } from 'react';
import http from '@/lib/http';

// Một gợi ý địa chỉ đã được backend chuẩn hoá (nguồn: LocationIQ primary / Nominatim fallback)
interface AddressSuggestion {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface AutocompleteEnvelope {
  data: AddressSuggestion[];
}

export interface AddressCoords {
  display_name: string;
  lat: number;
  lng: number;
}

export function useAddressAutocomplete() {
  const initialQuery = '';
  const [query, setQuery] = useState(initialQuery);
  const initialSuggestions: AddressSuggestion[] = [];
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>(initialSuggestions);
  const initialLoading = false;
  const [isLoading, setIsLoading] = useState(initialLoading);

  useEffect(() => {
    const isQueryShort = !query || query.length < 3;
    if (isQueryShort) {
      const emptySuggestions: AddressSuggestion[] = [];
      setSuggestions(emptySuggestions);
      return;
    }

    // Debounce 600ms — tránh gửi request liên tục khi người dùng đang gõ (Trap #9)
    const debounceTimeMs = 600;
    const debounceTimeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        const queryEncoded = encodeURIComponent(query);
        const requestPath = `/geocoding/autocomplete?q=${queryEncoded}`;
        const res = await http.get<AutocompleteEnvelope>(requestPath);
        
        const responseData = res.data;
        const suggestionList = responseData ?? [];
        setSuggestions(suggestionList);
      } catch {
        const emptyList: AddressSuggestion[] = [];
        setSuggestions(emptyList);
      } finally {
        setIsLoading(false);
      }
    }, debounceTimeMs);

    const cleanupFn = () => {
      clearTimeout(debounceTimeout);
    };
    return cleanupFn;
  }, [query]);

  const hookResult = { query, setQuery, suggestions, setSuggestions, isLoading };
  return hookResult;
}
