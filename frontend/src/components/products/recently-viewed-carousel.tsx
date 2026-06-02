"use client";

// React
import React, { useEffect, useState, useRef } from "react";

// Icons
import { Trash2, ChevronLeft, ChevronRight, History } from "lucide-react";

// Stores & Components
import { useRecentlyViewedStore } from "@/store/useRecentlyViewedStore";
import ProductCard from "@/components/product-card";

interface RecentlyViewedCarouselProps {
  currentProductId: string;
}

export default function RecentlyViewedCarousel({
  currentProductId,
}: RecentlyViewedCarouselProps) {
  const [mounted, setMounted] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const items = useRecentlyViewedStore((state) => state.items);
  const clearHistory = useRecentlyViewedStore((state) => state.clear);

  // Tránh lỗi Hydration Mismatch trong Next.js (SSR)
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  // Lọc bỏ sản phẩm hiện tại ra khỏi danh sách hiển thị
  const displayItems = items.filter((item) => {
    const isCurrent = item.id === currentProductId;
    return !isCurrent;
  });

  // Nếu không có sản phẩm nào khác trong lịch sử, ẩn toàn bộ section
  if (displayItems.length === 0) {
    return null;
  }

  const handleScrollLeft = () => {
    const container = scrollContainerRef.current;
    if (container) {
      const offset = -320;
      const behavior = "smooth" as const;
      const scrollConfig = { left: offset, behavior };
      container.scrollBy(scrollConfig);
    }
  };

  const handleScrollRight = () => {
    const container = scrollContainerRef.current;
    if (container) {
      const offset = 320;
      const behavior = "smooth" as const;
      const scrollConfig = { left: offset, behavior };
      container.scrollBy(scrollConfig);
    }
  };

  return (
    <div className="rounded-2xl border bg-white dark:bg-zinc-950 p-6 sm:p-8 space-y-6 shadow-sm animate-fade-in">
      {/* Header section with navigation and actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0" />
          <h3 className="text-lg font-extrabold text-foreground">
            Sản phẩm bạn đã xem gần đây
          </h3>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Navigation Scroll Buttons */}
          <div className="flex items-center border rounded-lg bg-zinc-50 dark:bg-zinc-900/50 p-0.5">
            <button
              type="button"
              onClick={handleScrollLeft}
              className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-muted-foreground hover:text-foreground transition"
              title="Cuộn sang trái"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-0.5" />
            <button
              type="button"
              onClick={handleScrollRight}
              className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-muted-foreground hover:text-foreground transition"
              title="Cuộn sang phải"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Clear History Button */}
          <button
            type="button"
            onClick={clearHistory}
            className="flex items-center text-xs font-semibold px-3 py-2 border rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-zinc-200 dark:border-zinc-800 hover:border-rose-200 transition shadow-sm bg-background"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            <span>Xóa lịch sử</span>
          </button>
        </div>
      </div>

      {/* Horizontal Scrollable Container */}
      <div className="relative">
        <div
          ref={scrollContainerRef}
          className="flex gap-6 overflow-x-auto pb-4 scrollbar-none scroll-smooth snap-x snap-mandatory"
          style={{ scrollbarWidth: "none" }}
        >
          {displayItems.map((product) => {
            const keyVal = `recently-viewed-${product.id}`;
            return (
              <div
                key={keyVal}
                className="w-[240px] sm:w-[280px] shrink-0 snap-start"
              >
                <ProductCard product={product} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
