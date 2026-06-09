'use client';

// Hooks
import { AddressCoords, useAddressAutocomplete } from '@/hooks/useAddressAutocomplete';

interface AddressAutocompleteProps {
  value: string;
  onSelect: (coords: AddressCoords) => void;
  onQueryChange?: () => void; // Gọi khi user gõ tay sau khi đã chọn → parent reset selectedCoords
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

export function AddressAutocomplete({
  value,
  onSelect,
  onQueryChange,
  placeholder,
  error,
  disabled,
}: AddressAutocompleteProps) {
  const { query, setQuery, suggestions, setSuggestions, isLoading } =
    useAddressAutocomplete();

  const handleSelect = (item: (typeof suggestions)[0]) => {
    const displayName = item.display_name;
    const selectedLat = parseFloat(item.lat);
    const selectedLng = parseFloat(item.lon);

    const coords: AddressCoords = {
      display_name: displayName,
      lat: selectedLat,
      lng: selectedLng,
    };

    setQuery(displayName);
    setSuggestions([]);
    onSelect(coords);
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    // Báo parent biết user đang gõ tay → cần chọn lại từ gợi ý để có tọa độ mới
    onQueryChange?.();
  };

  // Hiển thị query nếu user đang tìm, ngược lại hiển thị value từ form state (ví dụ khi prefill)
  const displayValue = query || value;

  return (
    <div className="relative">
      <input
        type="text"
        value={displayValue}
        onChange={handleQueryChange}
        placeholder={placeholder ?? 'Nhập địa chỉ...'}
        disabled={disabled}
        className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background transition ${
          error ? 'border-rose-500' : 'border-input'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      />

      {isLoading && (
        <span className="absolute right-3 top-2.5 text-xs text-muted-foreground animate-pulse">
          Đang tìm...
        </span>
      )}

      {suggestions.length > 0 && (
        <ul className="absolute z-50 w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl mt-1 max-h-60 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900">
          {suggestions.map((item) => {
            const placeId = item.place_id;
            const displayName = item.display_name;

            return (
              <li
                key={placeId}
                onClick={() => handleSelect(item)}
                className="px-3 py-2.5 hover:bg-violet-50 dark:hover:bg-violet-950/30 cursor-pointer text-xs text-foreground transition"
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
