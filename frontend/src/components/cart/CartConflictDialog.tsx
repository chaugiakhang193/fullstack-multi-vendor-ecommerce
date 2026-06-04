"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCartStore, CartItem } from "@/store/useCartStore";
import { AlertCircle, TrendingUp, RefreshCw, Trash2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { CartConflictReason } from "@/constants/enum";

export interface ConflictItem {
  productId: string;
  variantId: string | null;
  reason: CartConflictReason;
  oldPrice?: number;
  newPrice?: number;
  availableStock?: number;
  productName?: string;
  variantName?: string | null;
}


interface CartConflictDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: ConflictItem[];
  onResolve: () => void;
  onCancel?: () => void;
}

export default function CartConflictDialog({
  isOpen,
  onOpenChange,
  conflicts,
  onResolve,
  onCancel,
}: CartConflictDialogProps) {
  const { items } = useCartStore();

  // Helper tìm thông tin sản phẩm hiện tại trong Zustand giỏ hàng để bổ sung tên/ảnh hiển thị
  const findCartItem = (productId: string, variantId: string | null): CartItem | undefined => {
    return items.find(
      (item) => item.productId === productId && item.variantId === variantId
    );
  };

  const formatPriceVnd = (value: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(value);
  };

  const handleResolveConflicts = () => {
    const currentItems = useCartStore.getState().items;

    // Tiến hành cập nhật giá/số lượng theo dữ liệu xung đột mới
    const updatedItems = currentItems
      .map((item) => {
        const conflict = conflicts.find(
          (c) => c.productId === item.productId && c.variantId === item.variantId
        );

        if (!conflict) return item;

        // Nếu hết hàng hoàn toàn hoặc sản phẩm không còn bán/bị xóa/shop ngừng hoạt động
        if (
          conflict.reason === CartConflictReason.PRODUCT_DELETED ||
          conflict.reason === CartConflictReason.PRODUCT_HIDDEN ||
          conflict.reason === CartConflictReason.SHOP_INACTIVE ||
          (conflict.reason === CartConflictReason.OUT_OF_STOCK &&
            (conflict.availableStock === 0 || conflict.availableStock === undefined))
        ) {
          return null; // Xóa khỏi giỏ hàng
        }

        const updated = { ...item };

        // Nếu thay đổi giá
        if (conflict.reason === CartConflictReason.PRICE_CHANGED && conflict.newPrice !== undefined) {
          updated.price = conflict.newPrice;
        }

        // Nếu số lượng trong giỏ lớn hơn số lượng tồn kho khả dụng
        if (
          (conflict.reason === CartConflictReason.OUT_OF_STOCK ||
            conflict.reason === CartConflictReason.INSUFFICIENT_STOCK) &&
          conflict.availableStock !== undefined &&
          item.quantity > conflict.availableStock
        ) {
          updated.quantity = conflict.availableStock;
        }


        return updated;
      })
      .filter((item): item is CartItem => item !== null);

    // Cập nhật trực tiếp trạng thái Zustand store
    useCartStore.setState({ items: updatedItems });

    // Kích hoạt custom event đồng bộ các component khác
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("cart-updated"));
    }

    toast.success("Giỏ hàng đã được tự động cập nhật theo trạng thái mới nhất!");
    onOpenChange(false);
    onResolve();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6 rounded-2xl border dark:border-zinc-800 bg-white dark:bg-zinc-950 animate-fade-in">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <AlertCircle className="h-5 w-5" />
            <DialogTitle className="text-lg font-bold">Xung đột giỏ hàng khi thanh toán</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Một số sản phẩm trong giỏ hàng đã thay đổi về giá hoặc số lượng tồn kho trên hệ thống. Vui lòng xác nhận cập nhật trước khi thanh toán.
          </DialogDescription>
        </DialogHeader>

        {/* Danh sách các sản phẩm xung đột */}
        <div className="my-4 max-h-60 overflow-y-auto space-y-3 pr-1">
          {conflicts.map((conflict, index) => {
            const cartItem = findCartItem(conflict.productId, conflict.variantId);
            const name = conflict.productName || cartItem?.name || "Sản phẩm";
            const variantText = conflict.variantName || (cartItem?.variantId ? "Biến thể" : "");
            const thumbnail = cartItem?.thumbnailUrl || "/placeholder-product.png";

            return (
              <div
                key={`conflict-${conflict.productId}-${conflict.variantId || ""}-${index}`}
                className="flex gap-4 p-3 rounded-xl border border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/20"
              >
                {/* Ảnh sản phẩm */}
                <div className="relative h-12 w-12 rounded-lg overflow-hidden shrink-0 border dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnail}
                    alt={name}
                    className="h-full w-full object-cover"
                  />
                </div>

                {/* Chi tiết thay đổi */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-xs font-bold text-foreground truncate">{name}</div>
                  {variantText && (
                    <div className="text-[10px] text-muted-foreground font-semibold">{variantText}</div>
                  )}

                  {conflict.reason === CartConflictReason.PRICE_CHANGED ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold flex items-center gap-0.5 text-xs">
                        <TrendingUp className="h-3 w-3" /> Thay đổi giá
                      </span>
                      <span className="text-xs font-medium text-muted-foreground line-through">
                        {formatPriceVnd(conflict.oldPrice || cartItem?.price || 0)}
                      </span>
                      <span className="text-xs font-black text-rose-600 dark:text-rose-400">
                        ➔ {formatPriceVnd(conflict.newPrice || 0)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      {conflict.reason === CartConflictReason.PRODUCT_DELETED ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold flex items-center gap-0.5 text-xs">
                          <Trash2 className="h-3 w-3" /> Sản phẩm đã bị xóa
                        </span>
                      ) : conflict.reason === CartConflictReason.PRODUCT_HIDDEN ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold flex items-center gap-0.5 text-xs">
                          <Trash2 className="h-3 w-3" /> Sản phẩm ngừng bán
                        </span>
                      ) : conflict.reason === CartConflictReason.SHOP_INACTIVE ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold flex items-center gap-0.5 text-xs">
                          <Trash2 className="h-3 w-3" /> Shop ngừng hoạt động
                        </span>
                      ) : conflict.availableStock === 0 || conflict.availableStock === undefined ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold flex items-center gap-0.5 text-xs">
                          <Trash2 className="h-3 w-3" /> Hết hàng (Sẽ xóa khỏi giỏ)
                        </span>
                      ) : (
                        <>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold flex items-center gap-0.5 text-xs">
                            <ShoppingCart className="h-3 w-3" /> Điều chỉnh số lượng
                          </span>
                          <span className="text-xs text-muted-foreground font-medium">
                            Giỏ hàng: <strong className="text-foreground">{cartItem?.quantity || 0}</strong> ➔ Kho: <strong className="text-rose-600 dark:text-rose-400 font-bold">{conflict.availableStock}</strong>
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Nút thao tác */}
        <div className="flex flex-col sm:flex-row gap-3 mt-2">
          <button
            onClick={handleResolveConflicts}
            className="flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold shadow-md shadow-violet-500/10 active:scale-[0.98] transition cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Cập nhật & Tiếp tục thanh toán</span>
          </button>
          
          <button
            onClick={() => {
              onOpenChange(false);
              if (onCancel) onCancel();
            }}
            className="flex-1 py-2.5 px-4 border rounded-lg text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 transition active:scale-[0.98] cursor-pointer bg-background"
          >
            Hủy
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
