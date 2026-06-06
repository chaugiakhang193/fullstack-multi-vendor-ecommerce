"use client";

import React, { useState, useEffect, useRef } from "react";
import { SlidersHorizontal, X, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { StarRating } from "@/components/shared/star-rating";
import { cn } from "@/lib/utils";

// Định nghĩa types cho Filter
export interface FilterState {
  categoryIds: string[];
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
}

interface FilterSidebarProps {
  categories: any[]; // Hỗ trợ CategoryResponseType[] dạng cây
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onReset: () => void;
  className?: string;
}

export function FilterSidebar({
  categories,
  filters,
  onFilterChange,
  onReset,
  className,
}: FilterSidebarProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [localMin, setLocalMin] = useState(filters.minPrice?.toString() || "");
  const [localMax, setLocalMax] = useState(filters.maxPrice?.toString() || "");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const desktopMinInputRef = useRef<HTMLInputElement>(null);
  const mobileMinInputRef = useRef<HTMLInputElement>(null);

  // Đồng bộ giá trị input khoảng giá khi filter thay đổi từ bên ngoài (ví dụ reset)
  useEffect(() => {
    const minValStr = filters.minPrice?.toString() || "";
    const maxValStr = filters.maxPrice?.toString() || "";
    setLocalMin(minValStr);
    setLocalMax(maxValStr);
  }, [filters.minPrice, filters.maxPrice]);

  // Tự động mở rộng danh mục cha nếu có bất kỳ danh mục con nào đang được chọn
  useEffect(() => {
    if (!categories || categories.length === 0) return;
    setExpandedCategories((prev) => {
      const updated = { ...prev };
      let hasChanges = false;
      categories.forEach((parent) => {
        const hasActiveChild = parent.children?.some((child: any) =>
          filters.categoryIds.includes(child.id)
        );
        if (hasActiveChild && !updated[parent.id]) {
          updated[parent.id] = true;
          hasChanges = true;
        }
      });
      return hasChanges ? updated : prev;
    });
  }, [filters.categoryIds, categories]);

  const toggleExpandCategory = (parentId: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [parentId]: !prev[parentId],
    }));
  };

  const handleCategoryToggle = (id: string) => {
    const isSelected = filters.categoryIds.includes(id);
    let updatedIds: string[];

    if (isSelected) {
      updatedIds = [];
    } else {
      updatedIds = [id];
    }

    const updatedFilters = {
      ...filters,
      categoryIds: updatedIds,
    };
    onFilterChange(updatedFilters);
  };

  const handleMinPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalMin(val);
  };

  const handleMaxPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalMax(val);
  };

  const handleApplyPrice = (): boolean => {
    const minVal = localMin ? Number(localMin) : undefined;
    const maxVal = localMax ? Number(localMax) : undefined;

    if (minVal !== undefined && maxVal !== undefined && minVal > maxVal) {
      const errorText = "Giá tối thiểu không được lớn hơn giá tối đa!";
      toast.error(errorText);
      setLocalMin("");
      setLocalMax("");
      if (isMobileOpen) {
        mobileMinInputRef.current?.focus();
      } else {
        desktopMinInputRef.current?.focus();
      }
      return false;
    }

    const updatedFilters = {
      ...filters,
      minPrice: minVal,
      maxPrice: maxVal,
    };
    onFilterChange(updatedFilters);
    return true;
  };

  const handleMobileApply = () => {
    const success = handleApplyPrice();
    if (success) {
      setIsMobileOpen(false);
    }
  };

  const handleRatingClick = (rate: number) => {
    const isSelected = filters.rating === rate;
    const targetRating = isSelected ? undefined : rate;
    const updatedFilters = {
      ...filters,
      rating: targetRating,
    };
    onFilterChange(updatedFilters);
  };

  // Render nội dung bộ lọc bên trong
  const renderFilterContent = (isMobile: boolean) => {
    return (
      <div className="space-y-6">
        {/* Section 1: Categories */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
            Danh mục sản phẩm
          </h4>
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {categories.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Không có danh mục nào</p>
            ) : (
              categories.map((parent) => {
                const parentId = parent.id;
                const isParentChecked = filters.categoryIds.includes(parentId);
                const hasChildren = parent.children && parent.children.length > 0;
                const isExpanded = !!expandedCategories[parentId];

                return (
                  <div key={parentId} className="space-y-1.5 border-b border-zinc-100/50 dark:border-zinc-900/50 pb-1.5 last:border-0 last:pb-0">
                    {/* Danh mục cha */}
                    <div className="flex items-center justify-between group">
                      <label className="flex items-center gap-2 py-0.5 text-xs font-bold cursor-pointer text-foreground hover:text-violet-600 dark:hover:text-violet-400 flex-1">
                        <input
                          type="checkbox"
                          checked={isParentChecked}
                          onChange={() => handleCategoryToggle(parentId)}
                          className="h-3.5 w-3.5 rounded border-zinc-300 text-violet-600 focus:ring-violet-500/20"
                        />
                        <span>{parent.name}</span>
                      </label>
                      {hasChildren && (
                        <button
                          type="button"
                          onClick={() => toggleExpandCategory(parentId)}
                          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors text-muted-foreground hover:text-foreground"
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Danh mục con */}
                    {hasChildren && isExpanded && (
                      <div className="space-y-1.5 pl-5 pt-0.5 flex flex-col">
                        {parent.children.map((child: any) => {
                          const childId = child.id;
                          const isChildChecked = filters.categoryIds.includes(childId);

                          return (
                            <label
                              key={childId}
                              className="flex items-center gap-2 py-0.5 text-xs font-medium cursor-pointer text-muted-foreground hover:text-foreground"
                            >
                              <input
                                type="checkbox"
                                checked={isChildChecked}
                                onChange={() => handleCategoryToggle(childId)}
                                className="h-3.5 w-3.5 rounded border-zinc-300 text-violet-600 focus:ring-violet-500/20"
                              />
                              <span>{child.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <Separator />

        {/* Section 2: Price Range */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
            Khoảng giá (VND)
          </h4>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                ref={isMobile ? mobileMinInputRef : desktopMinInputRef}
                type="number"
                placeholder="Tối thiểu"
                value={localMin}
                onChange={handleMinPriceChange}
                className="w-full text-xs border rounded-lg p-2 bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
              <span className="text-muted-foreground text-xs">—</span>
              <input
                type="number"
                placeholder="Tối đa"
                value={localMax}
                onChange={handleMaxPriceChange}
                className="w-full text-xs border rounded-lg p-2 bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>
            <Button onClick={() => handleApplyPrice()} variant="outline" className="w-full text-xs h-8">
              Áp dụng
            </Button>
          </div>
        </div>

        <Separator />

        {/* Section 3: Rating */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
            Đánh giá sản phẩm
          </h4>
          <div className="space-y-1">
            {[5, 4, 3, 2, 1].map((starVal) => {
              const isSelected = filters.rating === starVal;

              return (
                <button
                  key={starVal}
                  onClick={() => handleRatingClick(starVal)}
                  className={cn(
                    "w-full flex items-center justify-between p-2 rounded-lg text-xs font-medium transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 text-left border",
                    isSelected
                      ? "bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-950/20 dark:text-violet-400 dark:border-violet-900/40"
                      : "border-transparent"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <StarRating rating={starVal} size="sm" />
                    <span className="text-muted-foreground font-semibold">
                      {starVal === 5 ? "5 sao" : `Từ ${starVal} sao`}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-600 dark:bg-violet-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Nút mở Mobile Drawer (Chỉ hiển thị trên thiết bị nhỏ) */}
      <div className="md:hidden w-full">
        <Button
          onClick={() => setIsMobileOpen(true)}
          variant="outline"
          className="w-full flex items-center justify-center gap-1.5 text-xs h-9 rounded-lg"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-violet-500" />
          <span>Bộ lọc sản phẩm</span>
        </Button>
      </div>

      {/* Giao diện Desktop (Mặc định hiển thị trên màn hình >= md) */}
      <div
        className={cn(
          "hidden md:block w-64 shrink-0 rounded-xl border bg-card p-5 shadow-xs space-y-5",
          className
        )}
      >
        <div className="flex items-center justify-between border-b pb-3">
          <span className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <SlidersHorizontal className="h-4 w-4 text-violet-500" />
            Bộ lọc
          </span>
          <button
            onClick={onReset}
            className="text-[10px] font-bold text-violet-600 dark:text-violet-400 flex items-center gap-1 hover:underline"
          >
            <RotateCcw className="h-3 w-3" />
            Xóa bộ lọc
          </button>
        </div>
        {renderFilterContent(false)}
      </div>

      {/* Mobile Drawer (Sử dụng Base UI Dialog trượt từ cạnh trái) */}
      <Dialog open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Popup className="fixed top-0 left-0 bottom-0 z-50 w-72 bg-popover p-5 text-sm text-popover-foreground shadow-xl border-r border-border duration-200 outline-none flex flex-col justify-between data-open:animate-in data-open:slide-in-from-left-full data-closed:animate-out data-closed:slide-out-to-left-full">
            {/* Header Drawer */}
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <span className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <SlidersHorizontal className="h-4 w-4 text-violet-500" />
                Bộ lọc
              </span>
              <DialogPrimitive.Close
                render={
                  <Button variant="ghost" className="p-1 h-7 w-7 rounded-md" />
                }
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </DialogPrimitive.Close>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto my-4 pr-1">
              {renderFilterContent(true)}
            </div>

            {/* Footer Drawer */}
            <div className="border-t pt-3 flex gap-2 shrink-0">
              <Button
                onClick={onReset}
                variant="outline"
                className="w-full text-xs h-9 rounded-lg"
              >
                Xóa tất cả
              </Button>
              <Button
                onClick={handleMobileApply}
                className="w-full text-xs h-9 rounded-lg"
              >
                Áp dụng
              </Button>
            </div>
          </DialogPrimitive.Popup>
        </DialogPortal>
      </Dialog>
    </>
  );
}

export default FilterSidebar;
