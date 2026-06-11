'use client';

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
// Hooks
import { AddressCoords, useAddressAutocomplete } from '@/hooks/useAddressAutocomplete';

interface AddressAutocompleteProps {
  value: string;
  onSelect: (coords: AddressCoords) => void;
  onQueryChange?: (value: string) => void; // Gọi khi user gõ tay → parent sync form field và reset selectedCoords
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  inputClassName?: string;
}

export function AddressAutocomplete({
  value,
  onSelect,
  onQueryChange,
  placeholder,
  error,
  disabled,
  inputClassName,
}: AddressAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { query, setQuery, suggestions, setSuggestions, isLoading } =
    useAddressAutocomplete();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setSuggestions]);

  const handleBlur = () => {
    // Delay slightly to allow handleSelect (onClick) to register first
    setTimeout(() => {
      setSuggestions([]);
    }, 200);
  };

  const handleSelect = (item: (typeof suggestions)[0]) => {
    const displayName = item.display_name;
    const selectedLat = parseFloat(item.lat);
    const selectedLng = parseFloat(item.lon);

    const coords: AddressCoords = {
      display_name: displayName,
      lat: selectedLat,
      lng: selectedLng,
    };

    // Đưa query về rỗng để useEffect debounce KHÔNG fire request thừa tìm lại
    // chính địa chỉ vừa chọn. Input hiển thị value cha (displayValue = query || value).
    setQuery('');
    setSuggestions([]);
    onSelect(coords);
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    // Truyền text đang gõ lên parent để sync form field, không chỉ reset coords
    onQueryChange?.(newQuery);
  };

  // Hiển thị query nếu user đang tìm, ngược lại hiển thị value từ form state (ví dụ khi prefill)
  const displayValue = query || value;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={displayValue}
        onChange={handleQueryChange}
        onBlur={handleBlur}
        placeholder={placeholder ?? 'Nhập địa chỉ...'}
        disabled={disabled}
        className={cn(
          "w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background transition",
          error ? 'border-rose-500' : 'border-input',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
          inputClassName
        )}
      />

      {isLoading && (
        <span className="absolute right-3 top-2.5 text-xs text-muted-foreground animate-pulse">
          Đang tìm...
        </span>
      )}

      {!disabled && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl mt-1 max-h-60 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900">
          {suggestions.map((item) => {
            const placeId = item.place_id;
            const displayName = item.display_name;

            return (
              <li
                key={placeId}
                onClick={() => handleSelect(item)}
                className="px-3 py-3.5 hover:bg-violet-50 dark:hover:bg-violet-950/30 cursor-pointer text-sm text-foreground transition"
              >
                {displayName}
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="text-rose-500 text-xs mt-1">{error}</p>}
    </div>
  );
}
