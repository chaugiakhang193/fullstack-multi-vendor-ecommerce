'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  X,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  ChevronDown,
  ArrowRight,
  Truck,
  ShoppingBag,
  Store,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
// Hooks
import { useCartStore, CartItem } from '@/store/useCartStore';
import { useActiveCart } from '@/hooks/useActiveCart';
import { SHIPPING_LIMITS } from '@/constants/limits.generated';

// Currency formatter
const priceFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
});

const formatPrice = (val: number) => {
  return priceFormatter.format(val);
};

// Target for free shipping (VND)
const FREE_SHIPPING_TARGET = SHIPPING_LIMITS.FREE_SHIPPING_THRESHOLD;

export default function CartDrawer() {
  const router = useRouter();
  const { isOpen, setIsOpen } = useCartStore();
  const { items, updateQuantity, removeItem, updateVariant } = useActiveCart();

  // State to track which item is currently toggled for variant quick swap
  // Key format: productId-variantId
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [isOpen]);

  // Group items by Shop ID
  const groupedItems = useMemo(() => {
    const groups: Record<string, { shopName: string; items: CartItem[] }> = {};
    items.forEach((item) => {
      const key = item.shopId || 'default-shop';
      if (!groups[key]) {
        groups[key] = { shopName: item.shopName || 'Cửa hàng', items: [] };
      }
      groups[key].items.push(item);
    });
    return groups;
  }, [items]);

  // Compute subtotal
  const subtotal = useMemo(() => {
    const total = items.reduce((sum, item) => {
      const price = Number(item.price);
      const quantity = Number(item.quantity);
      return (
        sum +
        (Number.isNaN(price) ? 0 : price) *
          (Number.isNaN(quantity) ? 0 : quantity)
      );
    }, 0);
    return total;
  }, [items]);

  // Free shipping progress bar calculations
  const freeShippingProgress = useMemo(() => {
    const progress = (subtotal / FREE_SHIPPING_TARGET) * 100;
    const finalProgress = progress > 100 ? 100 : progress;
    return finalProgress;
  }, [subtotal]);

  const remainingForFreeShipping = useMemo(() => {
    const diff = FREE_SHIPPING_TARGET - subtotal;
    const finalDiff = diff < 0 ? 0 : diff;
    return finalDiff;
  }, [subtotal]);

  const handleCheckoutClick = () => {
    setIsOpen(false);
    const targetCheckout = '/checkout';
    router.push(targetCheckout);
  };

  const handleViewCartClick = () => {
    setIsOpen(false);
    const targetCart = '/cart';
    router.push(targetCart);
  };

  // Helper to extract unique values for an attribute key from item's variants
  const getAttrOptions = (item: CartItem, key: string) => {
    const vals = new Set<string>();
    item.variants.forEach((v) => {
      const val = v.attributes?.[key];
      if (val) {
        vals.add(val);
      }
    });
    return Array.from(vals);
  };

  // Helper to get active attributes for an item
  const getItemAttributes = (item: CartItem) => {
    const currentVariant = item.variants.find((v) => v.id === item.variantId);
    return currentVariant?.attributes || {};
  };

  // Helper to handle inline attribute selection changes
  const handleSwapAttribute = (item: CartItem, key: string, val: string) => {
    const currentAttrs = getItemAttributes(item);
    const targetAttrs = { ...currentAttrs, [key]: val };

    // Find the keys that exist in any of the variants
    const allKeys = new Set<string>();
    item.variants.forEach((v) => {
      if (v.attributes) {
        Object.keys(v.attributes).forEach((k) => allKeys.add(k));
      }
    });
    const allKeysList = Array.from(allKeys);

    // Find variant that matches target selection
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
      updateVariant(item.productId, item.variantId, match.id);
      // Close editing pane after successful swap
      setEditingItemId(null);
    } else {
      // Find backup variant containing this key-value
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
        updateVariant(item.productId, item.variantId, backup.id);
        setEditingItemId(null);
      } else {
        const errorMsg = 'Không tìm thấy phiên bản phù hợp!';
        toast.error(errorMsg);
      }
    }
  };

  return (
    <>
      {/* Backdrop with Blur */}
      <div
        className={cn(
          'fixed inset-0 bg-black/60 backdrop-blur-xs z-50 transition-opacity duration-300 pointer-events-none opacity-0',
          isOpen && 'pointer-events-auto opacity-100',
        )}
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer Panel */}
      <div
        className={cn(
          'fixed top-0 right-0 bottom-0 w-full sm:max-w-lg bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 z-50 flex flex-col shadow-2xl transition-transform duration-300 transform translate-x-full',
          isOpen && 'translate-x-0',
        )}
      >
        {/* Drawer Header */}
        <div className="h-16 px-6 border-b border-zinc-100 dark:border-zinc-900 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <span className="text-base font-extrabold text-foreground">
              Giỏ hàng của bạn
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400">
              {items.length}
            </span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-muted-foreground hover:text-foreground transition border border-zinc-200/50 dark:border-zinc-800/50"
            title="Đóng giỏ hàng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Free Shipping Bar */}
        {items.length > 0 && (
          <div className="p-4 bg-violet-500/5 border-b border-zinc-100 dark:border-zinc-900 shrink-0 space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Truck className="h-4 w-4 text-violet-600 dark:text-violet-400 animate-pulse" />
              {remainingForFreeShipping > 0 ? (
                <span className="text-muted-foreground">
                  Mua thêm{' '}
                  <strong className="text-violet-600 dark:text-violet-400">
                    {formatPrice(remainingForFreeShipping)}
                  </strong>{' '}
                  để nhận freeship!
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                  Đơn hàng đã được miễn phí vận chuyển! 🎉
                </span>
              )}
            </div>
            <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${freeShippingProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900">
          {items.length === 0 ? (
            /* Empty State */
            <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-5">
              <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-muted-foreground/50">
                <ShoppingBag className="h-10 w-10" />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-lg font-black text-foreground">
                  Giỏ hàng trống
                </h4>
                <p className="text-sm text-muted-foreground max-w-[280px]">
                  Hiện chưa có sản phẩm nào trong giỏ hàng của bạn. Hãy chọn sản
                  phẩm yêu thích và thêm vào giỏ nhé!
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-sm font-bold px-6 py-3 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition shadow-md shadow-violet-500/20 cursor-pointer"
              >
                Tiếp tục mua sắm
              </button>
            </div>
          ) : (
            /* Grouped Items List */
            Object.entries(groupedItems).map(([shopId, group]) => (
              <div key={shopId} className="p-4 space-y-4">
                {/* Shop Title */}
                <div className="text-sm font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                  <Store className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
                  <span className="truncate">{group.shopName}</span>
                </div>

                {/* Items in Shop */}
                <div className="space-y-4">
                  {group.items.map((item) => {
                    const itemKey = `${item.productId}-${item.variantId || 'base'}`;
                    const isEditing = editingItemId === itemKey;
                    const itemAttributes = getItemAttributes(item);
                    const itemAttributeKeys = Object.keys(itemAttributes);

                    return (
                      <div
                        key={itemKey}
                        className="flex flex-col p-3 rounded-xl border border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/10 space-y-3"
                      >
                        <div className="flex gap-3">
                          {/* Image */}
                          <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-white border dark:border-zinc-800">
                            <Image
                              src={
                                item.thumbnailUrl || '/placeholder-product.png'
                              }
                              alt={item.name}
                              fill
                              sizes="64px"
                              className="object-cover"
                            />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0 space-y-1">
                            <Link
                              href={
                                item.variantId
                                  ? `/products/${item.productSlug}?variant=${item.variantId}`
                                  : `/products/${item.productSlug}`
                              }
                              onClick={() => setIsOpen(false)}
                              className="block text-sm font-bold text-foreground hover:text-violet-600 dark:hover:text-violet-400 transition leading-normal truncate"
                              title={item.name}
                            >
                              {item.name}
                            </Link>

                            {/* Attributes display */}
                            {item.variantId &&
                              (item.variantName ||
                                item.variants.length > 0) && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {item.variantName ? (
                                    <span className="inline-block px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-[9px] font-bold text-muted-foreground uppercase">
                                      {item.variantName}
                                    </span>
                                  ) : (
                                    Object.entries(itemAttributes).map(
                                      ([k, v]) => (
                                        <span
                                          key={k}
                                          className="inline-block px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-[9px] font-bold text-muted-foreground uppercase"
                                        >
                                          {v}
                                        </span>
                                      ),
                                    )
                                  )}
                                  {/* Quick Swap Trigger */}
                                  {item.variants.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditingItemId(
                                          isEditing ? null : itemKey,
                                        )
                                      }
                                      className="text-xs font-extrabold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-0.5 cursor-pointer ml-1"
                                    >
                                      <span>Đổi</span>
                                      <ChevronDown
                                        className={cn(
                                          'h-2.5 w-2.5 transition-transform',
                                          isEditing && 'rotate-180',
                                        )}
                                      />
                                    </button>
                                  )}
                                </div>
                              )}

                            {/* Price */}
                            <div className="text-sm font-extrabold text-violet-600 dark:text-violet-400">
                              {formatPrice(item.price)}
                            </div>
                          </div>
                        </div>

                        {/* Expandable Inline Variant Quick Swap Panel */}
                        {isEditing && item.variantId && (
                          <div className="p-2 rounded-lg border border-violet-100 dark:border-violet-950/30 bg-violet-50/10 dark:bg-violet-950/5 space-y-2 animate-fade-in">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                              Chọn phiên bản mới:
                            </p>
                            <div className="space-y-1.5">
                              {itemAttributeKeys.map((key) => {
                                const options = getAttrOptions(item, key);
                                const currentVal = itemAttributes[key];
                                return (
                                  <div
                                    key={key}
                                    className="flex items-center justify-between gap-2 text-xs"
                                  >
                                    <span className="text-xs font-semibold text-muted-foreground capitalize">
                                      {key === 'color'
                                        ? 'Màu sắc'
                                        : key === 'size'
                                          ? 'Kích thước'
                                          : key}
                                      :
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                      {options.map((opt) => {
                                        const isSelected = opt === currentVal;
                                        return (
                                          <button
                                            key={opt}
                                            type="button"
                                            onClick={() =>
                                              handleSwapAttribute(
                                                item,
                                                key,
                                                opt,
                                              )
                                            }
                                            className={cn(
                                              'px-2 py-0.5 rounded text-xs font-bold border transition',
                                              isSelected
                                                ? 'bg-violet-600 border-violet-600 text-white'
                                                : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900',
                                            )}
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

                        {/* Actions bar (Qty update & Delete) */}
                        <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-900/60 pt-2 shrink-0">
                          {/* Qty update buttons (Optimistic UI updates) */}
                          <div className="flex items-center border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden h-7 bg-white dark:bg-zinc-950 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(
                                  item.productId,
                                  item.variantId,
                                  item.quantity - 1,
                                )
                              }
                              className="w-7 h-full flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-900 transition text-muted-foreground hover:text-foreground border-r dark:border-zinc-800"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="px-3 text-sm font-black text-foreground min-w-8 text-center select-none">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(
                                  item.productId,
                                  item.variantId,
                                  item.quantity + 1,
                                )
                              }
                              className="w-7 h-full flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-900 transition text-muted-foreground hover:text-foreground border-l dark:border-zinc-800"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>

                          {/* Delete Item */}
                          <button
                            type="button"
                            onClick={() =>
                              removeItem(item.productId, item.variantId)
                            }
                            className="p-1 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition cursor-pointer"
                            title="Xóa sản phẩm"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Drawer Footer */}
        {items.length > 0 && (
          <div className="p-6 border-t border-zinc-100 dark:border-zinc-900 shrink-0 bg-white dark:bg-zinc-950 space-y-4">
            <div className="flex items-center justify-between text-base font-bold">
              <span className="text-muted-foreground">Tạm tính:</span>
              <span className="text-xl font-black text-violet-600 dark:text-violet-400">
                {formatPrice(subtotal)}
              </span>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleCheckoutClick}
                className="w-full h-11 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-sm font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-violet-500/20 cursor-pointer"
              >
                <span>Tiến hành thanh toán</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={handleViewCartClick}
                className="w-full h-11 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-foreground border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold transition cursor-pointer"
              >
                Xem chi tiết giỏ hàng
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
