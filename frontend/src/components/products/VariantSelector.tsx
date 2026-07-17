'use client';

import React, { useEffect, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

// Types
import type { ProductVariantResponseType } from '@/schemaValidations/products/products.schema';

interface VariantSelectorProps {
  variants: ProductVariantResponseType[];
  // Nhóm màu { màu: { hex, images } } — hex tường minh do seller chọn (ưu tiên chấm màu).
  colorGroups?: Record<string, { hex: string | null; images: string[] }> | null;
  onVariantSelect: (variant: ProductVariantResponseType | null) => void;
}

// Bản đồ tên màu → hex cho chấm màu. Hỗ trợ cả Tiếng Việt lẫn Tiếng Anh.
// Lưu ý: đây chỉ là lớp FALLBACK (đoán hex từ tên). Về lâu dài sẽ lưu hex tường
// minh do seller chọn (product.color_hex) — xem memory project_color_hex_followup.
const COLOR_MAP: Record<string, string> = {
  // Tiếng Việt
  Đen: '#18181b',
  'Đen Nhám': '#27272a',
  Trắng: '#ffffff',
  'Trắng thanh lịch': '#ffffff',
  Đỏ: '#ef4444',
  Xanh: '#3b82f6',
  'Xanh Dương': '#2563eb',
  'Xanh Lá': '#10b981',
  'Xanh Rêu': '#4d7c0f',
  Rêu: '#4d7c0f',
  Vàng: '#f59e0b',
  Cam: '#f97316',
  Tím: '#8b5cf6',
  Nâu: '#78350f',
  Bạc: '#cbd5e1',
  Be: '#e7d8b1',
  Kem: '#f5f0e1',
  'Titan Tự Nhiên': '#a1a1aa',
  Xám: '#71717a',
  Hồng: '#ec4899',
  // English
  black: '#18181b',
  white: '#ffffff',
  red: '#ef4444',
  blue: '#3b82f6',
  navy: '#1e3a8a',
  green: '#10b981',
  olive: '#4d7c0f',
  yellow: '#f59e0b',
  orange: '#f97316',
  purple: '#8b5cf6',
  brown: '#78350f',
  silver: '#cbd5e1',
  gold: '#d4af37',
  beige: '#e7d8b1',
  gray: '#71717a',
  grey: '#71717a',
  pink: '#ec4899',
};

// Chuẩn hoá key màu để tra bảng: NFC (gộp dấu tiếng Việt) + bỏ khoảng trắng thừa +
// thường hoá. Fix lỗi "Đỏ" (NFD) / "đỏ" / "Đỏ " không khớp literal NFC trong map.
const normalizeColorKey = (s: string): string =>
  s.normalize('NFC').trim().toLowerCase();

const NORMALIZED_COLOR_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(COLOR_MAP).map(([k, v]) => [normalizeColorKey(k), v]),
);

// Tra hex theo tên màu (đã normalize). Không có trong bảng → null (chỉ hiện chữ, không chấm).
const resolveColorHex = (name: string): string | null =>
  NORMALIZED_COLOR_MAP[normalizeColorKey(name)] ?? null;

// Thứ tự section thuộc tính: màu trước, rồi các phân loại thường gặp; key lạ xuống cuối.
const ATTR_KEY_ORDER = ['color', 'size', 'ram', 'storage', 'cpu'];
const attrKeyWeight = (key: string): number => {
  const i = ATTR_KEY_ORDER.indexOf(key);
  return i === -1 ? ATTR_KEY_ORDER.length : i;
};

// Thứ tự size chuẩn để không bị "L đứng trước S".
const SIZE_ORDER = [
  'xs',
  's',
  'm',
  'l',
  'xl',
  'xxl',
  '2xl',
  'xxxl',
  '3xl',
  '4xl',
];

// Rút số + đơn vị (GB/TB/MB) để sort RAM/dung lượng theo giá trị thật ("128gb" < "1tb").
const parseNumericValue = (s: string): number | null => {
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(tb|gb|mb)?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'tb') n *= 1024 * 1024;
  else if (unit === 'gb') n *= 1024;
  return n;
};

// So sánh giá trị option: size chuẩn → giá trị số → alphabet (vi). Tất định, FE-only.
const compareOptionValues = (a: string, b: string): number => {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();

  const sa = SIZE_ORDER.indexOf(na);
  const sb = SIZE_ORDER.indexOf(nb);
  if (sa !== -1 && sb !== -1) return sa - sb;
  if (sa !== -1) return -1;
  if (sb !== -1) return 1;

  const va = parseNumericValue(na);
  const vb = parseNumericValue(nb);
  if (va !== null && vb !== null) return va - vb;
  if (va !== null) return -1;
  if (vb !== null) return 1;

  return a.localeCompare(b, 'vi');
};

export default function VariantSelector({
  variants,
  colorGroups,
  onVariantSelect,
}: VariantSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 1. Tách tất cả các keys thuộc tính có mặt trong các variants (ví dụ: color, size, storage, ram, cpu)
  const allAttrKeys = useMemo(() => {
    const keys = new Set<string>();
    variants.forEach((v) => {
      if (v.attributes) {
        Object.keys(v.attributes).forEach((k) => keys.add(k));
      }
    });
    // Ép thứ tự: màu trước, rồi size/ram/storage/cpu (jsonb không giữ thứ tự key).
    return Array.from(keys).sort((a, b) => {
      const wa = attrKeyWeight(a);
      const wb = attrKeyWeight(b);
      return wa !== wb ? wa - wb : a.localeCompare(b);
    });
  }, [variants]);

  // 2. Thu thập danh sách các giá trị khả dụng cho từng key thuộc tính
  const attrOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    allAttrKeys.forEach((key) => {
      const vals = new Set<string>();
      variants.forEach((v) => {
        const val = v.attributes?.[key];
        if (val) {
          vals.add(val);
        }
      });
      // Sort tất định (S<M<L, số theo giá trị) — variant từ BE không có ORDER BY.
      options[key] = Array.from(vals).sort(compareOptionValues);
    });
    return options;
  }, [variants, allAttrKeys]);

  // 3. Đọc lựa chọn hiện tại từ URL Search Params
  const selectedAttributes = useMemo(() => {
    const selection: Record<string, string> = {};
    allAttrKeys.forEach((key) => {
      const paramVal = searchParams.get(key);
      if (paramVal) {
        selection[key] = paramVal;
      }
    });
    return selection;
  }, [searchParams, allAttrKeys]);

  // 4. Tìm variant khớp hoàn toàn với cấu hình thuộc tính đang chọn
  const activeVariant = useMemo(() => {
    const match = variants.find((v) => {
      if (!v.attributes) return false;
      return allAttrKeys.every(
        (key) => v.attributes?.[key] === selectedAttributes[key],
      );
    });
    return match || null;
  }, [variants, selectedAttributes, allAttrKeys]);

  // Truyền variant được chọn lên component cha và cập nhật param variant tương ứng
  useEffect(() => {
    onVariantSelect(activeVariant);
    if (typeof window !== 'undefined') {
      if (activeVariant) {
        const params = new URLSearchParams(window.location.search);
        if (params.get('variant') !== activeVariant.id) {
          params.set('variant', activeVariant.id);
          const newUrl = `${pathname}?${params.toString()}`;
          router.replace(newUrl, { scroll: false });
        }
      } else {
        const params = new URLSearchParams(window.location.search);
        if (params.has('variant')) {
          params.delete('variant');
          const newUrl = `${pathname}?${params.toString()}`;
          router.replace(newUrl, { scroll: false });
        }
      }
    }
  }, [activeVariant, onVariantSelect, pathname, router]);

  // 5. Thiết lập lựa chọn mặc định khi tải trang nếu có param variant
  useEffect(() => {
    const variantIdFromQuery = searchParams.get('variant');

    if (variantIdFromQuery && variants.length > 0) {
      // Nếu có variant id trong URL, đồng bộ hóa các attributes của variant đó vào URL search params
      const matchedVariant = variants.find((v) => v.id === variantIdFromQuery);
      if (matchedVariant?.attributes) {
        const hasAllAttrs = allAttrKeys.every((key) => searchParams.has(key));
        if (!hasAllAttrs) {
          const params = new URLSearchParams(window.location.search);
          Object.entries(matchedVariant.attributes).forEach(([k, v]) => {
            params.set(k, v);
          });
          const newUrl = `${pathname}?${params.toString()}`;
          router.replace(newUrl, { scroll: false });
        }
      }
    }
  }, [variants, allAttrKeys, searchParams, pathname, router]);

  // 6. Xử lý khi click chọn thuộc tính
  const handleSelectAttribute = (key: string, value: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set(key, value);

    // Kiểm tra xem tổ hợp mới có tồn tại không.
    // Nếu chọn thuộc tính mới dẫn đến tổ hợp không khả dụng, ta tìm variant tốt nhất có chứa thuộc tính mới đó để auto-select các thuộc tính khác.
    const tempSelection = { ...selectedAttributes, [key]: value };
    const exactMatchExists = variants.some((v) => {
      if (!v.attributes) return false;
      return allAttrKeys.every((k) => v.attributes?.[k] === tempSelection[k]);
    });

    if (!exactMatchExists) {
      // Tìm variant đầu tiên chứa thuộc tính vừa click, ưu tiên còn hàng
      const backupVariant =
        variants.find(
          (v) => v.attributes?.[key] === value && v.stock_quantity > 0,
        ) || variants.find((v) => v.attributes?.[key] === value);

      if (backupVariant?.attributes) {
        Object.entries(backupVariant.attributes).forEach(([k, val]) => {
          params.set(k, val);
        });
      }
    }

    const newUrl = `${pathname}?${params.toString()}`;
    router.replace(newUrl, { scroll: false });
  };

  // 7. Hàm kiểm tra xem một thuộc tính cụ thể có bị vô hiệu hóa (hết hàng hoàn toàn hoặc không khớp tổ hợp nào còn hàng)
  const isOptionDisabled = (key: string, value: string) => {
    // Để kiểm tra xem tùy chọn `value` của thuộc tính `key` có khả dụng hay không:
    // Chỉ cần kiểm tra xem có ít nhất một biến thể nào chứa thuộc tính này và còn hàng hay không.
    return !variants.some((v) => {
      if (!v.attributes) return false;
      if (v.stock_quantity <= 0) return false;
      return v.attributes[key] === value;
    });
  };

  // Dịch tên thuộc tính sang Tiếng Việt hiển thị
  const translateKey = (key: string) => {
    const map: Record<string, string> = {
      color: 'Màu sắc',
      size: 'Kích thước',
      storage: 'Dung lượng',
      ram: 'RAM',
      cpu: 'Vi xử lý',
    };
    return map[key] || key;
  };

  if (variants.length === 0) return null;

  return (
    <div className="space-y-6">
      {allAttrKeys.map((key) => {
        const options = attrOptions[key];
        const isColor = key === 'color';

        return (
          <div key={key} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                {translateKey(key)}:
              </span>
              <span className="text-sm font-extrabold text-foreground">
                {selectedAttributes[key] || 'Chưa chọn'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {options.map((option) => {
                const isSelected = selectedAttributes[key] === option;
                const isDisabled = isOptionDisabled(key, option);
                // Màu: chấm màu ưu tiên hex tường minh (seller chọn), fallback COLOR_MAP
                // normalize; không có cả 2 → null (chỉ hiện chữ, không chấm).
                const colorHex = isColor
                  ? (colorGroups?.[option]?.hex ?? resolveColorHex(option))
                  : null;

                // Render đồng nhất dạng chip chữ (màu = chip + chấm màu, kiểu Shopee).
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleSelectAttribute(key, option)}
                    className={cn(
                      'min-w-12 h-10 px-4 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 cursor-pointer select-none disabled:cursor-not-allowed',
                      isSelected
                        ? 'bg-violet-600 border-violet-600 text-white shadow-md shadow-violet-500/10'
                        : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900',
                      isDisabled &&
                        'opacity-30 line-through bg-zinc-100 dark:bg-zinc-900 border-zinc-200 text-muted-foreground',
                    )}
                  >
                    {colorHex && (
                      <span
                        className={cn(
                          'w-3.5 h-3.5 rounded-full border shrink-0',
                          isSelected
                            ? 'border-white/60'
                            : 'border-zinc-300 dark:border-zinc-700',
                        )}
                        style={{ backgroundColor: colorHex }}
                      />
                    )}
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
