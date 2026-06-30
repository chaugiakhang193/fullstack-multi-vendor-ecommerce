'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Trash2,
  ShieldCheck,
  ShoppingBag,
  ArrowRight,
  Loader2,
  Star,
} from 'lucide-react';
import { toast } from 'sonner';

// Hooks & Components
import { useActiveCart } from '@/hooks/useActiveCart';
import useHydrated from '@/hooks/useHydrated';
import CartShopGroup from './components/CartShopGroup';
import { EmptyCart } from '@/components/shared/empty-state';
import StickyCheckoutBar from '@/components/cart/StickyCheckoutBar';
import ProductCard from '@/components/products/product-card';
import { useRecommendProducts } from '@/hooks/useProducts';

// Helpers & Types
import { cn } from '@/lib/utils';
import { CartItem } from '@/store/useCartStore';

const isItemAvailable = (item: CartItem) => {
  const isDbItem = 'isAvailable' in item;
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
};

const getItemKey = (item: CartItem) => {
  const compositeKey = `${item.productId}_${item.variantId || 'none'}`;
  return compositeKey;
};

// Component con hiển thị giỏ hàng trống kết hợp danh sách sản phẩm gợi ý
function EmptyCartWithRecommend() {
  const { data: productsRes, isLoading } = useRecommendProducts(4);
  const recommendProducts = productsRes?.data?.items || [];

  return (
    <div className="space-y-16 py-12 animate-fade-in">
      <EmptyCart />

      {/* Recommended Products Section */}
      <div className="border-t border-zinc-100 dark:border-zinc-800/80 pt-16 space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-xl font-black text-foreground flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500 fill-current" /> Có thể
              bạn sẽ thích
            </h3>
            <p className="text-xs text-muted-foreground">
              Những sản phẩm đang thịnh hành và được yêu thích nhất
            </p>
          </div>
          <Link
            href="/products"
            className="text-xs font-black text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
          >
            Xem thêm <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
          </div>
        ) : recommendProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {recommendProducts.map((product) => {
              const cardKey = `recommend-${product.id}`;
              return <ProductCard key={cardKey} product={product} />;
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-muted-foreground italic">
            Không tải được gợi ý sản phẩm.
          </div>
        )}
      </div>
    </div>
  );
}

export default function CartPage() {
  const router = useRouter();
  const isHydrated = useHydrated();
  const { items, isLoading, updateQuantity, removeItem, updateVariant } =
    useActiveCart();

  // State to track selected items by composite keys
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  // Automatically deselect items that become unavailable and show a combined toast warning
  useEffect(() => {
    const unavailableSelectedNames: string[] = [];

    const nextKeys = selectedKeys.filter((key) => {
      const item = items.find((i) => getItemKey(i) === key);
      if (!item) return false;

      const isAvail = isItemAvailable(item);
      if (!isAvail) {
        unavailableSelectedNames.push(item.name);
      }
      return isAvail;
    });

    if (unavailableSelectedNames.length > 0) {
      if (unavailableSelectedNames.length === 1) {
        toast.warning(
          `Sản phẩm "${unavailableSelectedNames[0]}" hiện không khả dụng và đã được tự động bỏ chọn.`,
        );
      } else {
        toast.warning(
          `Có ${unavailableSelectedNames.length} sản phẩm đã chọn hiện không khả dụng và đã được tự động bỏ chọn.`,
        );
      }
      setSelectedKeys(nextKeys);
    }
  }, [items, selectedKeys]);

  // Group items by Shop ID
  const groupedItems = useMemo(() => {
    const groups: Record<string, { shopName: string; items: CartItem[] }> = {};
    items.forEach((item) => {
      const key = item.shopId || 'default-shop';
      if (!groups[key]) {
        groups[key] = {
          shopName: item.shopName || 'Cửa hàng',
          items: [],
        };
      }
      groups[key].items.push(item);
    });
    return groups;
  }, [items]);

  // Filter and get only selected and available items for calculation
  const selectedItems = useMemo(() => {
    const filteredList = items.filter((item) => {
      const targetItem = item;
      const key = getItemKey(targetItem);
      const isSelected = selectedKeys.includes(key);
      const isAvailable = isItemAvailable(targetItem);
      const keep = isSelected && isAvailable;
      return keep;
    });
    return filteredList;
  }, [items, selectedKeys]);

  const selectedCount = useMemo(() => {
    const count = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
    return count;
  }, [selectedItems]);

  const selectedAmount = useMemo(() => {
    const amount = selectedItems.reduce((sum, item) => {
      const itemSub = item.price * item.quantity;
      return sum + itemSub;
    }, 0);
    return amount;
  }, [selectedItems]);

  // Check if there are any unavailable items
  const unavailableItems = useMemo(() => {
    const list = items.filter((item) => {
      const targetItem = item;
      const isAvailable = isItemAvailable(targetItem);
      const isNotAvailable = !isAvailable;
      return isNotAvailable;
    });
    return list;
  }, [items]);

  const hasUnavailable = unavailableItems.length > 0;

  // Check if all available items in the entire cart are selected
  const allAvailableItems = useMemo(() => {
    const list = items.filter((item) => {
      const targetItem = item;
      const isAvailable = isItemAvailable(targetItem);
      return isAvailable;
    });
    return list;
  }, [items]);

  const hasAvailable = allAvailableItems.length > 0;

  const allAvailableSelected = useMemo(() => {
    const isAllSelected =
      hasAvailable &&
      allAvailableItems.every((item) => {
        const targetItem = item;
        const key = getItemKey(targetItem);
        const isSelected = selectedKeys.includes(key);
        return isSelected;
      });
    return isAllSelected;
  }, [allAvailableItems, hasAvailable, selectedKeys]);

  // Handlers complying with NO INLINE ARGUMENTS rule
  const handleToggleSelectItem = (item: CartItem) => {
    const targetItem = item;
    const key = getItemKey(targetItem);
    setSelectedKeys((prev) => {
      const isAlreadySelected = prev.includes(key);
      if (isAlreadySelected) {
        const nextState = prev.filter((k) => k !== key);
        return nextState;
      } else {
        const nextState = [...prev, key];
        return nextState;
      }
    });
  };

  const handleToggleSelectShop = (shopId: string, checkState: boolean) => {
    const shopItems = items.filter((item) => item.shopId === shopId);
    const shopAvailableItems = shopItems.filter((item) => {
      const targetItem = item;
      const isAvailable = isItemAvailable(targetItem);
      return isAvailable;
    });
    const shopAvailableKeys = shopAvailableItems.map((item) => {
      const targetItem = item;
      const key = getItemKey(targetItem);
      return key;
    });

    setSelectedKeys((prev) => {
      const filtered = prev.filter((k) => {
        const isFound = shopAvailableKeys.includes(k);
        const keep = !isFound;
        return keep;
      });
      if (checkState) {
        const nextState = [...filtered, ...shopAvailableKeys];
        return nextState;
      }
      return filtered;
    });
  };

  const handleToggleSelectAll = () => {
    const nextState = !allAvailableSelected;
    if (nextState) {
      const allKeys = allAvailableItems.map((item) => {
        const targetItem = item;
        const key = getItemKey(targetItem);
        return key;
      });
      setSelectedKeys(allKeys);
    } else {
      setSelectedKeys([]);
    }
  };

  const handleRemoveUnavailable = async () => {
    try {
      const promises = unavailableItems.map((item) => {
        const prodId = item.productId;
        const varId = item.variantId;
        const removePromise = removeItem(prodId, varId);
        return removePromise;
      });
      await Promise.all(promises);
      const successMsg = 'Đã dọn dẹp các sản phẩm không khả dụng!';
      toast.success(successMsg);
    } catch (error) {
      const errorMsg = 'Không thể dọn dẹp một số sản phẩm không khả dụng!';
      toast.error(errorMsg);
    }
  };

  const handleCheckout = () => {
    const count = selectedItems.length;
    if (count === 0) {
      const warnMsg =
        'Vui lòng chọn ít nhất một sản phẩm hợp lệ để thanh toán!';
      toast.error(warnMsg);
      return;
    }

    const selectedItemKeys = selectedItems.map((item) => {
      const isDbItem = 'id' in item;
      if (isDbItem) {
        const dbId = (item as any).id;
        return dbId;
      }
      const targetItem = item;
      const fallbackKey = getItemKey(targetItem);
      return fallbackKey;
    });

    if (typeof window !== 'undefined') {
      const storageKey = 'checkout_selected_items';
      const payloadString = JSON.stringify(selectedItemKeys);
      sessionStorage.setItem(storageKey, payloadString);
    }

    const targetCheckout = '/checkout';
    router.push(targetCheckout);
  };

  // Skeleton Loader for Cart Page
  if (!isHydrated || isLoading) {
    return (
      <div className="space-y-8 animate-pulse max-w-7xl mx-auto py-10">
        <div className="h-10 w-64 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-6">
            <div className="h-64 bg-zinc-100 dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50" />
            <div className="h-64 bg-zinc-100 dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50" />
          </div>
          <div className="lg:col-span-4 h-80 bg-zinc-100 dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50" />
        </div>
      </div>
    );
  }

  // Empty State
  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto py-10">
        <EmptyCartWithRecommend />
      </div>
    );
  }

  const groupedEntries = Object.entries(groupedItems);
  const totalCount = items.length;

  return (
    <div className="max-w-7xl mx-auto py-10 space-y-8 animate-fade-in pb-24 sm:pb-10">
      {/* Page Title */}
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Giỏ hàng của bạn
        </h1>
        <p className="text-sm text-muted-foreground font-semibold">
          Quản lý sản phẩm bạn đã chọn để tiến hành thanh toán (có {totalCount}{' '}
          sản phẩm).
        </p>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Groups of Items by Shop */}
        <div className="lg:col-span-8 space-y-6">
          {/* Global Selection Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={allAvailableSelected}
                disabled={!hasAvailable}
                onChange={handleToggleSelectAll}
                className="h-5 w-5 rounded border-zinc-300 dark:border-zinc-700 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 disabled:bg-zinc-100 dark:disabled:bg-zinc-900 disabled:border-zinc-200 dark:disabled:border-zinc-800 cursor-pointer disabled:cursor-not-allowed"
              />
              <span className="text-base font-black text-foreground">
                Chọn tất cả sản phẩm khả dụng
              </span>
            </div>

            {hasUnavailable && (
              <button
                type="button"
                onClick={handleRemoveUnavailable}
                className="flex items-center justify-center gap-1.5 px-4 py-2 border border-rose-200 hover:border-rose-300 dark:border-rose-950 bg-rose-50/50 hover:bg-rose-50 dark:bg-rose-950/10 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-black transition cursor-pointer self-end sm:self-auto"
              >
                <Trash2 className="h-4 w-4" />
                <span>Dọn dẹp sản phẩm không bán được</span>
              </button>
            )}
          </div>

          {/* Shop Groups */}
          <div className="space-y-6">
            {groupedEntries.map(([shopId, group]) => {
              return (
                <CartShopGroup
                  key={shopId}
                  shopId={shopId}
                  shopName={group.shopName}
                  items={group.items}
                  selectedItemIds={selectedKeys}
                  onToggleSelectItem={handleToggleSelectItem}
                  onToggleSelectShop={handleToggleSelectShop}
                  onUpdateQuantity={updateQuantity}
                  onRemove={removeItem}
                  onUpdateVariant={updateVariant}
                />
              );
            })}
          </div>
        </div>

        {/* Right Column: Checkout Summary Panel */}
        <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-6">
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 shadow-xs hidden sm:block">
            <h3 className="text-base font-black text-foreground border-b border-zinc-200/60 dark:border-zinc-800/60 pb-3 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span>Thông tin thanh toán</span>
            </h3>

            {/* Embedded Responsive Checkout Panel */}
            <div className="pt-4">
              <StickyCheckoutBar
                selectedCount={selectedCount}
                selectedAmount={selectedAmount}
                onCheckout={handleCheckout}
              />
            </div>
          </div>

          {/* Checkout Floating Bar for Mobile view */}
          <div className="block sm:hidden">
            <StickyCheckoutBar
              selectedCount={selectedCount}
              selectedAmount={selectedAmount}
              onCheckout={handleCheckout}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
