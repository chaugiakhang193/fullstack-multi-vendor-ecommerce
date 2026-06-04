"use client";

import React from "react";
import Link from "next/link";
import { Store } from "lucide-react";

// Components & Helpers
import CartItemRow from "./CartItemRow";
import { cn } from "@/lib/utils";
import { CartItem } from "@/store/useCartStore";

interface CartShopGroupProps {
  shopId: string;
  shopName: string;
  items: CartItem[];
  selectedItemIds: string[];
  onToggleSelectItem: (item: CartItem) => void;
  onToggleSelectShop: (shopId: string, checkState: boolean) => void;
  onUpdateQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  onRemove: (productId: string, variantId: string | null) => void;
  onUpdateVariant: (productId: string, oldVariantId: string | null, newVariantId: string | null) => void;
}

const priceFormatterObj = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
});

const formatPrice = (val: number) => {
  return priceFormatterObj.format(val);
};

export default function CartShopGroup({
  shopId,
  shopName,
  items,
  selectedItemIds,
  onToggleSelectItem,
  onToggleSelectShop,
  onUpdateQuantity,
  onRemove,
  onUpdateVariant,
}: CartShopGroupProps) {
  // Determine availability of items to check if shop group has selectables
  const availableItems = items.filter((item) => {
    const isDbItem = "isAvailable" in item;
    if (isDbItem) {
      const dbIsAvailable = (item as any).isAvailable;
      return dbIsAvailable;
    }
    const variantInfo = item.variantId
      ? item.variants.find((v) => v.id === item.variantId)
      : null;
    const stockVal = variantInfo ? variantInfo.stock_quantity : item.baseStock;
    const isAvail = stockVal > 0;
    return isAvail;
  });

  const hasAvailable = availableItems.length > 0;

  // Check if all available items are selected
  const allAvailableSelected =
    hasAvailable &&
    availableItems.every((item) => {
      const itemKey = `${item.productId}_${item.variantId || "none"}`;
      const isIncluded = selectedItemIds.includes(itemKey);
      return isIncluded;
    });

  // Calculate total shop subtotal for items in this shop
  const shopSubtotal = items.reduce((sum, item) => {
    const itemSubtotal = item.price * item.quantity;
    return sum + itemSubtotal;
  }, 0);

  const handleCheckboxChange = () => {
    const targetShopId = shopId;
    const nextState = !allAvailableSelected;
    onToggleSelectShop(targetShopId, nextState);
  };

  const priceVal = shopSubtotal;
  const formattedSubtotal = formatPrice(priceVal);

  return (
    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/20 dark:bg-zinc-900/5 p-4 sm:p-6 space-y-4">
      {/* Shop Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
        <div className="flex items-center gap-3">
          {/* Shop Select-All Checkbox */}
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={allAvailableSelected}
              disabled={!hasAvailable}
              onChange={handleCheckboxChange}
              className="h-5 w-5 rounded border-zinc-300 dark:border-zinc-700 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 disabled:bg-zinc-100 dark:disabled:bg-zinc-900 disabled:border-zinc-200 dark:disabled:border-zinc-800 cursor-pointer disabled:cursor-not-allowed"
            />
          </div>

          {/* Shop Title Icon and Link */}
          <Link
            href={`/shops/${shopId}`}
            className="flex items-center gap-2 group cursor-pointer"
          >
            <div className="p-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 group-hover:bg-violet-100 dark:group-hover:bg-violet-950/60 transition">
              <Store className="h-4.5 w-4.5" />
            </div>
            <span className="text-sm font-black text-foreground group-hover:text-violet-600 dark:group-hover:text-violet-400 transition uppercase tracking-wider">
              {shopName}
            </span>
          </Link>
        </div>

        {/* Shop Subtotal */}
        <div className="text-xs sm:text-sm font-bold text-muted-foreground flex items-center gap-1.5 self-end sm:self-auto pl-8 sm:pl-0">
          <span>Tạm tính cửa hàng:</span>
          <span className="text-sm sm:text-base font-black text-violet-600 dark:text-violet-400">
            {formattedSubtotal}
          </span>
        </div>
      </div>

      {/* Shop Item Rows */}
      <div className="space-y-3">
        {items.map((item) => {
          const itemKey = `${item.productId}_${item.variantId || "none"}`;
          const isSelected = selectedItemIds.includes(itemKey);

          return (
            <CartItemRow
              key={itemKey}
              item={item}
              isSelected={isSelected}
              onToggleSelect={onToggleSelectItem}
              onUpdateQuantity={onUpdateQuantity}
              onRemove={onRemove}
              onUpdateVariant={onUpdateVariant}
            />
          );
        })}
      </div>
    </div>
  );
}
