import { useState, useEffect } from 'react';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export interface AddressCoords {
  display_name: string;
  lat: number;
  lng: number;
}

export function useAddressAutocomplete() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }

    // Debounce 600ms — tránh gửi request liên tục khi người dùng đang gõ (Trap #9)
    const debounceTimeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        // Gọi trực tiếp từ client IP, không qua backend server để phân tán request
        const searchUrl = new URL('https://nominatim.openstreetmap.org/search');
        searchUrl.searchParams.set('q', query);
        searchUrl.searchParams.set('format', 'json');
        searchUrl.searchParams.set('limit', '5');
        searchUrl.searchParams.set('countrycodes', 'vn');

        const response = await fetch(searchUrl.toString(), {
          headers: { 'Accept-Language': 'vi' },
        });

        const data: NominatimResult[] = await response.json();
        setSuggestions(data);
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 600);

    return () => clearTimeout(debounceTimeout);
  }, [query]);

  return { query, setQuery, suggestions, setSuggestions, isLoading };
}
