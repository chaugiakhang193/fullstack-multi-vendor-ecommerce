'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Trash2, ChevronDown, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';

// Helpers & Types
import { cn } from '@/lib/utils';
import { CartItem } from '@/store/useCartStore';

interface CartItemRowProps {
  item: CartItem;
  isSelected: boolean;
  onToggleSelect: (item: CartItem) => void;
  onUpdateQuantity: (
    productId: string,
    variantId: string | null,
    quantity: number,
  ) => void;
  onRemove: (productId: string, variantId: string | null) => void;
  onUpdateVariant: (
    productId: string,
    oldVariantId: string | null,
    newVariantId: string | null,
  ) => void;
}

const priceFormatterObj = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
});

const formatPrice = (val: number) => {
  return priceFormatterObj.format(val);
};

export default function CartItemRow({
  item,
  isSelected,
  onToggleSelect,
  onUpdateQuantity,
  onRemove,
  onUpdateVariant,
}: CartItemRowProps) {
  const [isEditing, setIsEditing] = useState(false);

  // Helper to extract unique values for an attribute key from item's variants
  const getAttrOptions = (key: string) => {
    const vals = new Set<string>();
    item.variants.forEach((v) => {
      const val = v.attributes?.[key];
      if (val) {
        vals.add(val);
      }
    });
    const resultList = Array.from(vals);
    return resultList;
  };

  // Helper to get active attributes for an item
  const getItemAttributes = () => {
    const currentVariant = item.variants.find((v) => v.id === item.variantId);
    const attrs = currentVariant?.attributes || {};
    return attrs;
  };

  const itemAttributes = getItemAttributes();
  const itemAttributeKeys = Object.keys(itemAttributes);

  // Helper to determine availability and reason
  const getAvailability = () => {
    const isDbItem = 'isAvailable' in item;
    if (isDbItem) {
      const dbIsAvailable = (item as any).isAvailable;
      const dbReason = (item as any).reason;
      const dbResult = {
        isAvailable: dbIsAvailable,
        reason: dbReason,
      };
      return dbResult;
    }
    // Guest item logic based on stock
    const variantInfo = item.variantId
      ? item.variants.find((v) => v.id === item.variantId)
      : null;
    const stockVal = variantInfo ? variantInfo.stock_quantity : item.baseStock;
    const isAvail = stockVal > 0;
    const mappedReason = isAvail ? undefined : 'out_of_stock';
    const guestResult = {
      isAvailable: isAvail,
      reason: mappedReason,
    };
    return guestResult;
  };

  const availability = getAvailability();
  const isAvailable = availability.isAvailable;
  const reason = availability.reason;

  let badgeText = '';
  let badgeColor =
    'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'; // Semantic color matching rules

  if (!isAvailable) {
    switch (reason) {
      case 'out_of_stock':
      case 'insufficient_stock':
        badgeText = 'Hết hàng';
        break;
      case 'product_hidden':
        badgeText = 'Sản phẩm tạm ẩn';
        badgeColor =
          'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
        break;
      case 'product_deleted':
        badgeText = 'Sản phẩm ngừng bán';
        break;
      case 'shop_inactive':
        badgeText = 'Cửa hàng tạm ngưng';
        badgeColor =
          'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
        break;
      default:
        badgeText = 'Không khả dụng';
    }
  }

  // Event Handlers conforming to NO INLINE ARGUMENTS rule
  const handleCheckboxChange = () => {
    const targetItem = item;
    onToggleSelect(targetItem);
  };

  const handleDecrease = () => {
    const prodId = item.productId;
    const varId = item.variantId;
    const newQty = item.quantity - 1;
    onUpdateQuantity(prodId, varId, newQty);
  };

  const handleIncrease = () => {
    const prodId = item.productId;
    const varId = item.variantId;
    const newQty = item.quantity + 1;
    onUpdateQuantity(prodId, varId, newQty);
  };

  const handleDelete = () => {
    const prodId = item.productId;
    const varId = item.variantId;
    onRemove(prodId, varId);
  };

  const handleToggleEdit = () => {
    const nextState = !isEditing;
    setIsEditing(nextState);
  };

  const handleSwapAttribute = (key: string, val: string) => {
    const currentAttrs = getItemAttributes();
    const targetAttrs = { ...currentAttrs, [key]: val };

    const allKeys = new Set<string>();
    item.variants.forEach((v) => {
      if (v.attributes) {
        Object.keys(v.attributes).forEach((k) => allKeys.add(k));
      }
    });
    const allKeysList = Array.from(allKeys);

    const match = item.variants.find((v) => {
      if (!v.attributes) return false;
      return allKeysList.every((k) => v.attributes?.[k] === targetAttrs[k]);
    });

    if (match) {
      if (match.stock_quantity <= 0) {
        const errorMsg = 'Phiên bản này hiện đã hết hàng!';
        toast.error(errorMsg);
        return;
      }
      const prodId = item.productId;
      const oldVarId = item.variantId;
      const newVarId = match.id;
      onUpdateVariant(prodId, oldVarId, newVarId);
      setIsEditing(false);
    } else {
      const backup =
        item.variants.find(
          (v) => v.attributes?.[key] === val && v.stock_quantity > 0,
        ) || item.variants.find((v) => v.attributes?.[key] === val);

      if (backup) {
        if (backup.stock_quantity <= 0) {
          const errorMsg = 'Phiên bản này hiện đã hết hàng!';
          toast.error(errorMsg);
          return;
        }
        const prodId = item.productId;
        const oldVarId = item.variantId;
        const newVarId = backup.id;
        onUpdateVariant(prodId, oldVarId, newVarId);
        setIsEditing(false);
      } else {
        const errorMsg = 'Không tìm thấy phiên bản phù hợp!';
        toast.error(errorMsg);
      }
    }
  };

  // Variable formatting for UI display
  const finalPrice = item.price;
  const formattedPrice = formatPrice(finalPrice);
  const rowSubtotal = finalPrice * item.quantity;
  const formattedSubtotal = formatPrice(rowSubtotal);

  const opacityClass = !isAvailable ? 'opacity-60' : '';
  const containerClass = cn(
    'flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-900 rounded-xl transition-all duration-200 shadow-xs hover:shadow-md',
    opacityClass,
  );

  return (
    <div className={containerClass}>
      {/* Product Details Section (Image, Name, Variants) */}
      <div className="flex items-start gap-4 flex-1 min-w-0 w-full">
        {/* Checkbox */}
        <div className="pt-2 flex items-center justify-center shrink-0">
          <input
            type="checkbox"
            checked={isSelected}
            disabled={!isAvailable}
            onChange={handleCheckboxChange}
            className="h-5 w-5 rounded border-zinc-300 dark:border-zinc-700 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 disabled:bg-zinc-100 dark:disabled:bg-zinc-900 disabled:border-zinc-200 dark:disabled:border-zinc-800 cursor-pointer disabled:cursor-not-allowed"
          />
        </div>

        {/* Thumbnail Image */}
        <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-white border dark:border-zinc-800 shadow-inner">
          <Image
            src={item.thumbnailUrl || '/placeholder-product.png'}
            alt={item.name}
            fill
            sizes="80px"
            className="object-cover"
          />
        </div>

        {/* Text Details */}
        <div className="flex-1 min-w-0 space-y-1">
          <Link
            href={
              item.variantId
                ? `/products/${item.productSlug}?variant=${item.variantId}`
                : `/products/${item.productSlug}`
            }
            className="block text-sm font-extrabold text-foreground hover:text-violet-600 dark:hover:text-violet-400 transition leading-snug truncate"
            title={item.name}
          >
            {item.name}
          </Link>

          {/* Badges for unavailable items */}
          {!isAvailable && (
            <div className="pt-0.5">
              <span
                className={cn(
                  'inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider',
                  badgeColor,
                )}
              >
                {badgeText}
              </span>
            </div>
          )}

          {/* Selected Variant Attributes display */}
          {item.variantId && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {item.variantName ? (
                <span className="inline-block px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 text-[10px] font-bold text-muted-foreground uppercase">
                  {item.variantName}
                </span>
              ) : (
                Object.entries(itemAttributes).map(([k, v]) => {
                  const badgeKey = `${k}-${v}`;
                  return (
                    <span
                      key={badgeKey}
                      className="inline-block px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 text-[10px] font-bold text-muted-foreground uppercase"
                    >
                      {v}
                    </span>
                  );
                })
              )}

              {/* Quick Swap Trigger (Only for Guest Zustand items with variant list) */}
              {item.variants.length > 0 && isAvailable && (
                <button
                  type="button"
                  onClick={handleToggleEdit}
                  className="text-[10px] font-extrabold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-0.5 cursor-pointer ml-1"
                >
                  <span>Thay đổi</span>
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 transition-transform',
                      isEditing && 'rotate-180',
                    )}
                  />
                </button>
              )}
            </div>
          )}

          {/* Expandable Inline Variant Quick Swap Panel (Zustand Guest only) */}
          {isEditing &&
            item.variantId &&
            isAvailable &&
            item.variants.length > 0 && (
              <div className="p-3 mt-2 rounded-lg border border-violet-100 dark:border-violet-950/30 bg-violet-50/5 dark:bg-violet-950/5 space-y-2.5 max-w-sm animate-fade-in">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                  Chọn phân loại mới:
                </p>
                <div className="space-y-2">
                  {itemAttributeKeys.map((key) => {
                    const options = getAttrOptions(key);
                    const currentVal = itemAttributes[key];
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-4 text-xs"
                      >
                        <span className="text-[10px] font-bold text-muted-foreground capitalize">
                          {key === 'color'
                            ? 'Màu sắc'
                            : key === 'size'
                              ? 'Kích thước'
                              : key}
                          :
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {options.map((opt) => {
                            const isSelectedOpt = opt === currentVal;
                            const optClass = cn(
                              'px-2.5 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer',
                              isSelectedOpt
                                ? 'bg-violet-600 border-violet-600 text-white shadow-xs'
                                : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900',
                            );
                            const handleOptionClick = () => {
                              handleSwapAttribute(key, opt);
                            };
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={handleOptionClick}
                                className={optClass}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
        </div>
      </div>

      {/* Actions and Pricing Section */}
      <div className="flex flex-row md:flex-row items-center justify-between md:justify-end gap-6 w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-zinc-100 dark:border-zinc-900">
        {/* Unit Price (Hidden on mobile grid, shown nicely) */}
        <div className="text-right hidden sm:block md:w-28">
          <div className="text-xs text-muted-foreground font-semibold">
            Đơn giá
          </div>
          <div className="text-sm font-bold text-foreground mt-0.5">
            {formattedPrice}
          </div>
        </div>

        {/* Quantity Stepper */}
        <div className="flex flex-col items-start gap-1">
          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block sm:hidden">
            Số lượng
          </span>
          <div className="flex items-center border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden h-8 bg-white dark:bg-zinc-950 shrink-0">
            <button
              type="button"
              disabled={item.quantity <= 1 || !isAvailable}
              onClick={handleDecrease}
              className="w-8 h-full flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-900 transition text-muted-foreground hover:text-foreground border-r dark:border-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="px-3.5 text-xs font-black text-foreground min-w-9 text-center select-none">
              {item.quantity}
            </span>
            <button
              type="button"
              disabled={!isAvailable}
              onClick={handleIncrease}
              className="w-8 h-full flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-900 transition text-muted-foreground hover:text-foreground border-l dark:border-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Subtotal */}
        <div className="text-right md:w-32">
          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block sm:hidden">
            Tạm tính
          </span>
          <div className="text-sm font-black text-violet-600 dark:text-violet-400 sm:mt-0.5">
            {formattedSubtotal}
          </div>
        </div>

        {/* Delete Button */}
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleDelete}
            className="p-2 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition cursor-pointer border border-transparent hover:border-rose-100 dark:hover:border-rose-950/30"
            title="Xóa sản phẩm"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
