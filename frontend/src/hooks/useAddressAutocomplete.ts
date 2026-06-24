import { useState, useEffect } from 'react';

// API
import geocodingApiRequest from '@/apiRequests/geocoding/geocoding';

// Schema
import { AddressSuggestionType } from '@/schemaValidations/geocoding/geocoding.schema';

export interface AddressCoords {
  display_name: string;
  lat: number;
  lng: number;
}

export function useAddressAutocomplete() {
  const initialQuery = '';
  const [query, setQuery] = useState(initialQuery);
  const initialSuggestions: AddressSuggestionType[] = [];
  const [suggestions, setSuggestions] =
    useState<AddressSuggestionType[]>(initialSuggestions);
  const initialLoading = false;
  const [isLoading, setIsLoading] = useState(initialLoading);

  useEffect(() => {
    const isQueryShort = !query || query.length < 3;
    if (isQueryShort) {
      const emptySuggestions: AddressSuggestionType[] = [];
      setSuggestions(emptySuggestions);
      return;
    }

    // Debounce 600ms — tránh gửi request liên tục khi người dùng đang gõ
    const debounceTimeMs = 600;
    const debounceTimeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await geocodingApiRequest.autocomplete(query);
        const responseData = res.data;
        const suggestionList = responseData ?? [];
        setSuggestions(suggestionList);
      } catch {
        const emptyList: AddressSuggestionType[] = [];
        setSuggestions(emptyList);
      } finally {
        setIsLoading(false);
      }
    }, debounceTimeMs);

    const cleanupFn = () => clearTimeout(debounceTimeout);
    return cleanupFn;
  }, [query]);

  const hookResult = {
    query,
    setQuery,
    suggestions,
    setSuggestions,
    isLoading,
  };
  return hookResult;
}
