"use client";

import React from "react";
import { ArrowRight } from "lucide-react";

interface StickyCheckoutBarProps {
  selectedCount: number;
  selectedAmount: number;
  onCheckout: () => void;
  isLoading?: boolean;
}

const priceFormatterObj = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
});

const formatPrice = (val: number) => {
  return priceFormatterObj.format(val);
};

export default function StickyCheckoutBar({
  selectedCount,
  selectedAmount,
  onCheckout,
  isLoading = false,
}: StickyCheckoutBarProps) {
  const formattedPrice = formatPrice(selectedAmount);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 p-4 shadow-[0_-8px_30px_rgb(0,0,0,0.06)] sm:static sm:shadow-none sm:border sm:rounded-2xl sm:p-6 sm:bg-zinc-50/50 sm:dark:bg-zinc-900/10 flex flex-col gap-4 animate-fade-in pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6">
      {/* Mobile view layout: side-by-side. Desktop view layout: stacked. */}
      <div className="flex sm:flex-col items-center justify-between sm:items-stretch gap-2 w-full">
        <div className="flex flex-col sm:gap-1 text-left">
          <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Tổng thanh toán ({selectedCount} sản phẩm):
          </span>
          <span className="text-xl sm:text-2xl font-black text-violet-600 dark:text-violet-400">
            {formattedPrice}
          </span>
        </div>

        {/* Placeholders for coupon/delivery info on desktop layout */}
        <div className="hidden sm:flex flex-col gap-2.5 text-xs font-semibold text-muted-foreground border-t border-zinc-200/60 dark:border-zinc-800/60 pt-4 mt-2">
          <div className="flex justify-between">
            <span>Phí vận chuyển:</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">Miễn phí (Freeship)</span>
          </div>
          <div className="flex justify-between">
            <span>Giảm giá voucher:</span>
            <span>- {formatPrice(0)}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={selectedCount === 0 || isLoading}
        onClick={onCheckout}
        className="w-full h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-zinc-300 disabled:to-zinc-300 dark:disabled:from-zinc-800 dark:disabled:to-zinc-800 disabled:text-zinc-500 text-white rounded-xl text-sm font-extrabold transition flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20 disabled:shadow-none hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
      >
        <span>Mua hàng ({selectedCount})</span>
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
