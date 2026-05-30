"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ProductResponseType } from "@/schemaValidations/products/products.schema";
import { toast } from "sonner";
import { ShoppingCart, Star, Store } from "lucide-react";

interface ProductCardProps {
  product: ProductResponseType;
}

// Khai báo formatter bên ngoài component để tránh re-creation thừa trên RAM
const priceFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
});

const formatPrice = (val: number) => {
  return priceFormatter.format(val);
};

interface LocalCartItem {
  productId: string;
  variantId: string | null;
  quantity: number;
  name: string;
  price: number;
  thumbnailUrl: string;
  shopName: string;
}

export default function ProductCard({ product }: ProductCardProps) {
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
    let cartItems: LocalCartItem[] = [];
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

    // Xác định đúng giá tiền và hình ảnh theo biến thể được chọn
    const finalPrice = targetVariant
      ? product.price + targetVariant.additional_price
      : product.price;
    const finalThumbnailUrl =
      targetVariant && targetVariant.images && targetVariant.images.length > 0
        ? targetVariant.images[0]
        : (product.thumbnail_url || "/placeholder-product.png");

    const findItemFn = (item: LocalCartItem) => {
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
      const newItem: LocalCartItem = {
        productId: product.id,
        variantId: variantId,
        quantity: 1,
        name: product.name,
        price: finalPrice,
        thumbnailUrl: finalThumbnailUrl,
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
          <Image
            src={product.thumbnail_url || "/placeholder-product.png"}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />

          {/* Badge Out of stock */}
          {isOutOfStock ? (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center text-white text-sm font-bold uppercase tracking-wider z-10">
              Tạm hết hàng
            </div>
          ) : (
            /* Quick Add to Cart button (Only shows when in-stock on hover) */
            <button
              type="button"
              onClick={handleQuickAdd}
              className="absolute bottom-4 right-4 p-3 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 z-10"
              title="Thêm nhanh vào giỏ"
            >
              <ShoppingCart className="h-5 w-5" />
            </button>
          )}

          {/* Featured / Highlight Badge (Placeholder for Sale badge) */}
          {isFeatured && !isOutOfStock && (
            <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-rose-500 text-white uppercase tracking-wider shadow-sm z-10">
              Nổi bật
            </span>
          )}
        </div>

        {/* Product Details Info */}
        <div className="p-4 flex-1 flex flex-col justify-between gap-2.5">
          <div className="space-y-1.5">
            {/* Shop name */}
            <div className="text-sm font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{product.shop?.name || "Cửa hàng"}</span>
            </div>

            {/* Product Name */}
            <h3 className="text-base font-extrabold text-foreground leading-snug line-clamp-2 h-12 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
              {product.name}
            </h3>
          </div>

          <div className="space-y-1.5">
            {/* Stars / Rating reviews placeholder */}
            <div className="flex items-center gap-0.5 text-amber-500">
              <Star className="h-3.5 w-3.5 fill-current" />
              <Star className="h-3.5 w-3.5 fill-current" />
              <Star className="h-3.5 w-3.5 fill-current" />
              <Star className="h-3.5 w-3.5 fill-current" />
              <Star className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-700 fill-current" />
              <span className="text-sm text-muted-foreground font-bold ml-1">
                (4.0)
              </span>
            </div>

            {/* Product Price */}
            <div className="text-xl font-black text-violet-600 dark:text-violet-400">
              {priceText}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
