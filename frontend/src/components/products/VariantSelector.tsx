"use client";

import React, { useEffect, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

// Types
import type { ProductVariantResponseType } from "@/schemaValidations/products/products.schema";

interface VariantSelectorProps {
  variants: ProductVariantResponseType[];
  onVariantSelect: (variant: ProductVariantResponseType | null) => void;
}

// Color map helper for visual color swatches
const COLOR_MAP: Record<string, string> = {
  "Đen": "#18181b",
  "Đen Nhám": "#27272a",
  "Trắng": "#ffffff",
  "Trắng thanh lịch": "#ffffff",
  "Đỏ": "#ef4444",
  "Xanh": "#3b82f6",
  "Xanh Dương": "#2563eb",
  "Xanh Lá": "#10b981",
  "Vàng": "#f59e0b",
  "Titan Tự Nhiên": "#a1a1aa",
  "Xám": "#71717a",
  "Hồng": "#ec4899",
};

export default function VariantSelector({
  variants,
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
    return Array.from(keys);
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
      options[key] = Array.from(vals);
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
      return allAttrKeys.every((key) => v.attributes?.[key] === selectedAttributes[key]);
    });
    return match || null;
  }, [variants, selectedAttributes, allAttrKeys]);

  // Truyền variant được chọn lên component cha
  useEffect(() => {
    onVariantSelect(activeVariant);
  }, [activeVariant, onVariantSelect]);

  // 5. Thiết lập lựa chọn mặc định khi tải trang nếu URL chưa có params
  useEffect(() => {
    const hasAnyParam = allAttrKeys.some((key) => searchParams.has(key));
    if (!hasAnyParam && variants.length > 0) {
      // Ưu tiên chọn variant đầu tiên còn hàng, nếu không thì lấy variant đầu tiên
      const defaultVariant = variants.find((v) => v.stock_quantity > 0) || variants[0];
      if (defaultVariant.attributes) {
        const params = new URLSearchParams(window.location.search);
        Object.entries(defaultVariant.attributes).forEach(([k, v]) => {
          params.set(k, v);
        });
        const newUrl = `${pathname}?${params.toString()}`;
        router.replace(newUrl, { scroll: false });
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
        variants.find((v) => v.attributes?.[key] === value && v.stock_quantity > 0) ||
        variants.find((v) => v.attributes?.[key] === value);

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
      color: "Màu sắc",
      size: "Kích thước",
      storage: "Dung lượng",
      ram: "RAM",
      cpu: "Vi xử lý",
    };
    return map[key] || key;
  };

  if (variants.length === 0) return null;

  return (
    <div className="space-y-6">
      {allAttrKeys.map((key) => {
        const options = attrOptions[key];
        const isColor = key === "color";

        return (
          <div key={key} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                {translateKey(key)}:
              </span>
              <span className="text-sm font-extrabold text-foreground">
                {selectedAttributes[key] || "Chưa chọn"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {options.map((option) => {
                const isSelected = selectedAttributes[key] === option;
                const isDisabled = isOptionDisabled(key, option);

                if (isColor) {
                  // Render Color Swatches
                  const hexColor = COLOR_MAP[option] || "#e4e4e7";
                  const isWhite = option.toLowerCase().includes("trắng");

                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleSelectAttribute(key, option)}
                      className={cn(
                        "relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 border-2 cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed",
                        isSelected
                          ? "border-violet-600 scale-110 ring-2 ring-violet-500/20"
                          : "border-zinc-200 dark:border-zinc-800 hover:scale-105"
                      )}
                      title={option}
                    >
                      <span
                        className={cn(
                          "w-7 h-7 rounded-full block border",
                          isWhite ? "border-zinc-200" : "border-transparent"
                        )}
                        style={{ backgroundColor: hexColor }}
                      />
                      {/* Checkmark or indicator when selected */}
                      {isSelected && (
                        <span
                          className={cn(
                            "absolute inset-0 rounded-full border-2 border-white pointer-events-none"
                          )}
                        />
                      )}
                      {/* X lines if out of stock */}
                      {isDisabled && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-8 h-[2px] bg-rose-500/80 rotate-45" />
                        </div>
                      )}
                    </button>
                  );
                }

                // Render Size or other attributes as Chips
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleSelectAttribute(key, option)}
                    className={cn(
                      "min-w-12 h-10 px-4 rounded-xl text-xs font-bold transition-all border flex items-center justify-center cursor-pointer select-none disabled:cursor-not-allowed",
                      isSelected
                        ? "bg-violet-600 border-violet-600 text-white shadow-md shadow-violet-500/10"
                        : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900",
                      isDisabled && "opacity-30 line-through bg-zinc-100 dark:bg-zinc-900 border-zinc-200 text-muted-foreground"
                    )}
                  >
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
