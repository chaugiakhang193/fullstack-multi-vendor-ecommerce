'use client';

import React from 'react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

export type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'popular';

interface SortDropdownProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
  className?: string;
}

const sortItems = [
  { value: 'newest', label: '🆕 Mới nhất' },
  { value: 'price_asc', label: '💰 Giá thấp → cao' },
  { value: 'price_desc', label: '💰 Giá cao → thấp' },
  { value: 'popular', label: '🔥 Phổ biến nhất' },
];

export function SortDropdown({
  value,
  onChange,
  className,
}: SortDropdownProps) {
  return (
    <div className="relative">
      <Select
        value={value}
        onValueChange={(val) => onChange(val as SortOption)}
        items={sortItems}
      >
        <SelectTrigger className={className} size="default">
          <SelectValue placeholder="Sắp xếp theo" />
        </SelectTrigger>
        <SelectContent align="end" sideOffset={4}>
          {sortItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default SortDropdown;
