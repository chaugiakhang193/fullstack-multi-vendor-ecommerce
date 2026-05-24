"use client";

import React from "react";
import Link from "next/link";
import { ProductResponseType } from "@/schemaValidations/products.schema";
import { toast } from "sonner";
import { ShoppingCart, Star, Store } from "lucide-react";

interface ProductCardProps {
  product: ProductResponseType;
}

export default function ProductCard({ product }: ProductCardProps) {
  // Format giá tiền Việt Nam Đồng
  const formatPrice = (val: number) => {
    const currencyOptions: Intl.NumberFormatOptions = {
      style: "currency",
      currency: "VND",
    };
    const formatted = new Intl.NumberFormat("vi-VN", currencyOptions).format(val);
    return formatted;
  };

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const isOutOfStock = product.stock_quantity === 0;
    if (isOutOfStock) {
      const outOfStockMsg = "Sản phẩm hiện đang hết hàng!";
      toast.error(outOfStockMsg);
      return;
    }

    const cartKey = "cart";
    const existingCart = localStorage.getItem(cartKey);
    let cartItems = [];
    if (existingCart) {
      try {
        cartItems = JSON.parse(existingCart);
      } catch (error) {
        const logTitle = "Lỗi phân tích giỏ hàng:";
        console.error(logTitle, error);
      }
    }

    if (!Array.isArray(cartItems)) {
      cartItems = [];
    }

    // Chọn biến thể đầu tiên của sản phẩm nếu có, ngược lại lấy sản phẩm gốc
    const targetVariant = product.variants?.[0];
    const variantId = targetVariant ? targetVariant.id : null;

    const findItemFn = (item: any) => {
      const isSameProduct = item.productId === product.id;
      const isSameVariant = item.variantId === variantId;
      return isSameProduct && isSameVariant;
    };
    const existingItem = cartItems.find(findItemFn);

    if (existingItem) {
      const maxQuantity = targetVariant ? targetVariant.stock_quantity : product.stock_quantity;
      const newQty = existingItem.quantity + 1;
      if (newQty > maxQuantity) {
        const limitMsg = "Số lượng trong giỏ hàng đã đạt giới hạn tồn kho!";
        toast.error(limitMsg);
        return;
      }
      existingItem.quantity = newQty;
    } else {
      const newItem = {
        productId: product.id,
        variantId: variantId,
        quantity: 1,
        name: product.name,
        price: product.price,
        thumbnailUrl: product.thumbnail_url,
        shopName: product.shop?.name || "Cửa hàng",
      };
      cartItems.push(newItem);
    }

    const stringifiedCart = JSON.stringify(cartItems);
    localStorage.setItem(cartKey, stringifiedCart);

    const successMsg = `Đã thêm ${product.name} vào giỏ hàng!`;
    toast.success(successMsg);

    // Phát sự kiện để cập nhật Badge giỏ hàng trên Header trong thời gian thực
    const cartUpdateEventName = "cart-updated";
    const customEvent = new CustomEvent(cartUpdateEventName);
    window.dispatchEvent(customEvent);
  };

  const detailUrl = `/products/${product.slug}-i.${product.id}`;
  const priceVal = product.price;
  const priceText = formatPrice(priceVal);

  const isFeatured = product.is_featured;
  const isOutOfStock = product.stock_quantity === 0;

  return (
    <Link href={detailUrl} className="block group">
      <div className="relative rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden hover:scale-[1.02] hover:shadow-md transition-all duration-300 flex flex-col h-full">
        {/* Thumbnail Image Wrapper */}
        <div className="relative w-full aspect-square overflow-hidden bg-zinc-100 dark:bg-zinc-900">
          <img
            src={product.thumbnail_url || "/placeholder-product.png"}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />

          {/* Badge Out of stock */}
          {isOutOfStock ? (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center text-white text-xs font-bold uppercase tracking-wider">
              Tạm hết hàng
            </div>
          ) : (
            /* Quick Add to Cart button (Only shows when in-stock on hover) */
            <button
              onClick={handleQuickAdd}
              className="absolute bottom-3 right-3 p-2.5 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 z-10"
              title="Thêm nhanh vào giỏ"
            >
              <ShoppingCart className="h-4 w-4" />
            </button>
          )}

          {/* Featured / Highlight Badge (Placeholder for Sale badge) */}
          {isFeatured && !isOutOfStock && (
            <span className="absolute top-3 left-3 px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-rose-500 text-white uppercase tracking-wider shadow-sm">
              Nổi bật
            </span>
          )}
        </div>

        {/* Product Details Info */}
        <div className="p-4 flex-1 flex flex-col justify-between gap-2.5">
          <div className="space-y-1.5">
            {/* Shop name */}
            <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <Store className="h-3 w-3 shrink-0" />
              <span className="truncate">{product.shop?.name || "Cửa hàng"}</span>
            </div>

            {/* Product Name */}
            <h3 className="text-xs font-bold text-foreground leading-snug line-clamp-2 h-8 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
              {product.name}
            </h3>
          </div>

          <div className="space-y-1.5">
            {/* Stars / Rating reviews placeholder */}
            <div className="flex items-center gap-0.5 text-amber-500">
              <Star className="h-3 w-3 fill-current" />
              <Star className="h-3 w-3 fill-current" />
              <Star className="h-3 w-3 fill-current" />
              <Star className="h-3 w-3 fill-current" />
              <Star className="h-3 w-3 text-zinc-300 dark:text-zinc-700 fill-current" />
              <span className="text-[10px] text-muted-foreground font-bold ml-1">
                (4.0)
              </span>
            </div>

            {/* Product Price */}
            <div className="text-sm font-bold text-violet-600 dark:text-violet-400">
              {priceText}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
