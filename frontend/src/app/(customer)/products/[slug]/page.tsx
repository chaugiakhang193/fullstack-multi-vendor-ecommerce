"use client";

import React, { useState, useEffect, use, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingCart,
  Star,
  Store,
  ChevronRight,
  Plus,
  Minus,
  ShieldCheck,
  Truck,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

// Services & Store
import productsApiRequest from "@/apiRequests/products/products";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useRecentlyViewedStore } from "@/store/useRecentlyViewedStore";
import sellerShopsApiRequest from "@/apiRequests/shops/seller-shops";

// Components
import VariantSelector from "@/components/products/VariantSelector";
import RecentlyViewedCarousel from "@/components/products/recently-viewed-carousel";
import { Button } from "@/components/ui/button";

// Types
import type { ProductVariantResponseType } from "@/schemaValidations/products/products.schema";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const priceFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
});

const formatPrice = (val: number) => {
  return priceFormatter.format(val);
};

// Helper to extract UUID from the SEO slug (e.g. "ao-thun-premium-i.uuid")
const extractProductId = (slug: string): string => {
  const match = slug.match(
    /-i\.([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/
  );
  return match ? match[1] : slug;
};

export default function ProductDetailPage({ params }: PageProps) {
  const router = useRouter();
  const resolvedParams = use(params);
  const rawSlug = resolvedParams.slug;
  const productId = extractProductId(rawSlug);

  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariantResponseType | null>(null);
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  const mainImageRef = useRef<HTMLImageElement>(null);
  const addItem = useCartStore((state) => state.addItem);
  const setIsOpen = useCartStore((state) => state.setIsOpen);
  const user = useAuthStore((state) => state.user);

  // Fetch product detail using React Query
  const fetchDetailFn = () => {
    const detailPromise = productsApiRequest.getProductDetail(productId);
    return detailPromise;
  };
  const { data: detailRes, isLoading, error } = useQuery({
    queryKey: ["product-detail", productId],
    queryFn: fetchDetailFn,
    retry: 1,
  });

  const product = detailRes?.data;
  const addProductToRecentlyViewed = useRecentlyViewedStore((state) => state.addProduct);

  // Lưu sản phẩm vào danh sách vừa xem gần đây
  useEffect(() => {
    if (product) {
      addProductToRecentlyViewed(product);
    }
  }, [product, addProductToRecentlyViewed]);

  // Fetch seller's own shop if logged in as seller
  const { data: myShopRes } = useQuery({
    queryKey: ["my-shop-detail"],
    queryFn: () => {
      const myShopPromise = sellerShopsApiRequest.getMyShop();
      return myShopPromise;
    },
    enabled: user?.role === "seller",
    retry: false,
  });
  const myShop = myShopRes?.data;

  const isOwnProduct = product && myShop
    ? product.shop?.id === myShop.id
    : false;

  // Logic scroll ẩn/hiện Sticky Bar trên Mobile
  useEffect(() => {
    const handleScroll = () => {
      const scrollThreshold = 500;
      if (window.scrollY > scrollThreshold) {
        setShowStickyBar(true);
      } else {
        setShowStickyBar(false);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Set initial main image when product loaded
  useEffect(() => {
    if (product) {
      const initialImage = product.thumbnail_url;
      setActiveImageUrl(initialImage);
    }
  }, [product]);

  // Redirect SEO URL
  useEffect(() => {
    if (product) {
      const canonicalSlug = `${product.slug}-i.${product.id}`;
      if (rawSlug !== canonicalSlug) {
        const redirectUrl = `/products/${canonicalSlug}`;
        router.replace(redirectUrl);
      }
    }
  }, [product, rawSlug, router]);

  // When variant changes, update active main image to variant's first image (if available)
  useEffect(() => {
    if (selectedVariant && selectedVariant.images && selectedVariant.images.length > 0) {
      const variantImage = selectedVariant.images[0];
      setActiveImageUrl(variantImage);
    } else if (product) {
      const fallbackImage = product.thumbnail_url;
      setActiveImageUrl(fallbackImage);
    }
  }, [selectedVariant, product]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-12 animate-fade-in py-8">
        <div className="h-6 w-64 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 space-y-4">
            <div className="aspect-square bg-zinc-200 dark:bg-zinc-800 rounded-2xl animate-pulse" />
            <div className="flex gap-2.5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="w-20 h-20 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
          <div className="lg:col-span-6 space-y-6">
            <div className="h-10 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
            <div className="h-6 w-1/4 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
            <div className="h-12 w-1/3 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
            <div className="space-y-2 pt-4">
              <div className="h-8 w-full bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
              <div className="h-8 w-2/3 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-7xl mx-auto py-16 text-center space-y-4">
        <h2 className="text-2xl font-extrabold text-rose-600">Lỗi tải sản phẩm</h2>
        <p className="text-muted-foreground text-sm">
          Không tìm thấy sản phẩm hoặc đường dẫn không hợp lệ.
        </p>
        <Link href="/" className="inline-block">
          <Button variant="outline" className="text-xs font-semibold px-4 py-2">
            Quay lại Trang chủ
          </Button>
        </Link>
      </div>
    );
  }

  // Price calculations based on variant
  const finalPrice = selectedVariant
    ? Number(product.price) + Number(selectedVariant.additional_price)
    : Number(product.price);

  // Max stock limit check
  const maxStock = selectedVariant
    ? selectedVariant.stock_quantity
    : product.stock_quantity;

  const isOutOfStock = maxStock === 0;

  // Gallery compilation (Aggregated Gallery from server, but fallback to manually compile if empty)
  const gallery = product.aggregated_gallery || [];

  const handleQtyMinus = () => {
    if (isOwnProduct) return;
    if (quantity > 1) {
      const prevQty = quantity - 1;
      setQuantity(prevQty);
    }
  };

  const handleQtyPlus = () => {
    if (isOwnProduct) return;
    if (quantity < maxStock) {
      const nextQty = quantity + 1;
      setQuantity(nextQty);
    } else {
      const limitMsg = "Số lượng đã đạt giới hạn tồn kho của phiên bản này!";
      toast.warning(limitMsg);
    }
  };

  // Fly-to-cart animation logic
  const triggerFlyToCartAnimation = () => {
    const mainImg = mainImageRef.current;
    const cartEl = document.querySelector('button[id="header-cart-btn"]') || document.querySelector('a[href="/cart"]');
    
    if (mainImg && cartEl) {
      const imgRect = mainImg.getBoundingClientRect();
      const cartRect = cartEl.getBoundingClientRect();

      const clone = document.createElement("img");
      clone.src = mainImg.src;
      clone.style.position = "fixed";
      clone.style.left = `${imgRect.left}px`;
      clone.style.top = `${imgRect.top}px`;
      clone.style.width = `${imgRect.width}px`;
      clone.style.height = `${imgRect.height}px`;
      clone.style.borderRadius = "16px";
      clone.style.zIndex = "9999";
      clone.style.pointerEvents = "none";
      clone.style.transition = "all 0.8s cubic-bezier(0.25, 1, 0.5, 1)";

      document.body.appendChild(clone);

      // Force reflow
      clone.getBoundingClientRect();

      clone.style.left = `${cartRect.left + cartRect.width / 2 - 15}px`;
      clone.style.top = `${cartRect.top + cartRect.height / 2 - 15}px`;
      clone.style.width = "30px";
      clone.style.height = "30px";
      clone.style.opacity = "0.1";
      clone.style.transform = "scale(0.1) rotate(360deg)";

      setTimeout(() => {
        clone.remove();
        // Scale bounce effect on cart button
        const targetBtn = cartEl.querySelector("button") || cartEl;
        targetBtn.classList.add("scale-110", "bg-violet-100", "dark:bg-violet-900/30");
        setTimeout(() => {
          targetBtn.classList.remove("scale-110", "bg-violet-100", "dark:bg-violet-900/30");
          // Open the Cart Drawer after fly animation completes
          setIsOpen(true);
        }, 200);
      }, 800);
    } else {
      // Fallback: Open drawer immediately if animation fails
      setIsOpen(true);
    }
  };

  const handleAddToCart = () => {
    if (isOwnProduct) {
      const ownProductMsg = "Bạn không thể mua sản phẩm của chính shop mình!";
      toast.error(ownProductMsg);
      return;
    }

    if (isOutOfStock) {
      const errorMsg = "Sản phẩm hiện đang tạm hết hàng!";
      toast.error(errorMsg);
      return;
    }

    if (product.has_variants && !selectedVariant) {
      const warningMsg = "Vui lòng chọn đầy đủ các phân loại phiên bản!";
      toast.warning(warningMsg);
      return;
    }

    // Add to Zustand Cart Store (Tuân thủ No Inline Arguments)
    const cartItem = {
      productId: product.id,
      variantId: selectedVariant ? selectedVariant.id : null,
      name: product.name,
      price: Number(finalPrice),
      thumbnailUrl: activeImageUrl || product.thumbnail_url || "/placeholder-product.png",
      shopId: product.shop?.id || "default-shop",
      shopName: product.shop?.name || "Cửa hàng",
      productSlug: rawSlug,
      variants: product.variants || [],
      basePrice: Number(product.price),
      hasVariants: product.has_variants,
      baseStock: product.stock_quantity,
      quantity,
    };
    addItem(cartItem);

    // Trigger Fly Animation
    triggerFlyToCartAnimation();
  };

  const handleStickyAddToCart = () => {
    if (isOwnProduct) return;

    if (product.has_variants && !selectedVariant) {
      const warningMsg = "Vui lòng chọn phiên bản sản phẩm!";
      toast.warning(warningMsg);
      const selectorEl = document.getElementById("variant-selector-section");
      if (selectorEl) {
        const scrollOptions: ScrollIntoViewOptions = {
          behavior: "smooth",
          block: "center",
        };
        selectorEl.scrollIntoView(scrollOptions);
      }
      return;
    }
    handleAddToCart();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-10 py-6">
      {/* Breadcrumbs Navigation */}
      <nav className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider bg-white dark:bg-zinc-950 p-4 rounded-xl border">
        <Link href="/" className="hover:text-violet-600 transition-colors">
          Trang chủ
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="hover:text-violet-600 transition-colors">
          {product.category?.name || "Sản phẩm"}
        </span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground truncate max-w-[280px]">
          {product.name}
        </span>
      </nav>

      {/* Main Product Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left Column: Image Area */}
        <div className="lg:col-span-6 space-y-4">
          {/* Main Visual Display */}
          <div className="relative aspect-square w-full rounded-2xl border bg-white dark:bg-zinc-950 overflow-hidden shadow-sm flex items-center justify-center">
            {activeImageUrl ? (
              <Image
                ref={mainImageRef}
                src={activeImageUrl}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover transition-all duration-300"
                priority
              />
            ) : (
              <div className="text-muted-foreground text-sm italic">Không có hình ảnh</div>
            )}
            
            {/* Out of Stock Label */}
            {isOutOfStock && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center text-white text-base font-black uppercase tracking-widest">
                Tạm hết hàng
              </div>
            )}
          </div>

          {/* Gallery Thumbnails List */}
          {gallery.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {gallery.map((url, idx) => {
                const isActive = activeImageUrl === url;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageUrl(url)}
                    className={`relative w-20 h-20 rounded-xl overflow-hidden shrink-0 border-2 bg-white dark:bg-zinc-950 transition-all ${
                      isActive ? "border-violet-600 scale-105" : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
                    }`}
                  >
                    <Image
                      src={url}
                      alt={`${product.name} gallery ${idx + 1}`}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Specifications & Actions */}
        <div className="lg:col-span-6 space-y-6 bg-white dark:bg-zinc-950 p-6 sm:p-8 rounded-2xl border shadow-sm">
          <div className="space-y-3">
            {/* Shop badge and details */}
            <div className="flex items-center justify-between gap-4 border-b pb-4">
              <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest">
                <Store className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
                <span className="truncate">{product.shop?.name || "Cửa hàng"}</span>
              </div>
              <Link
                href={`/shops/${product.shop?.id}`}
                className="text-xs font-black text-violet-600 dark:text-violet-400 hover:underline"
              >
                Xem Shop
              </Link>
            </div>

            {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-black text-foreground leading-tight">
              {product.name}
            </h1>

            {/* Ratings Summary */}
            <div className="flex items-center gap-1.5 text-amber-500 pt-1">
              <div className="flex items-center gap-0.5">
                {[...Array(4)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
                <Star className="h-4 w-4 text-zinc-300 dark:text-zinc-700 fill-current" />
              </div>
              <span className="text-xs font-bold text-muted-foreground ml-1">
                4.0 (50 đánh giá) | Đã bán 289
              </span>
            </div>

            {isOwnProduct && (
              <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs text-amber-700 dark:text-amber-400 font-bold flex items-center gap-2 animate-pulse">
                <span>⚠️ Bạn đang xem sản phẩm thuộc sở hữu của shop bạn. Tính năng mua hàng bị vô hiệu hóa.</span>
              </div>
            )}
          </div>

          {/* Pricing Box */}
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-900/50 flex flex-col gap-1">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Giá bán hiện tại:
            </span>
            <div className="text-3xl font-black text-violet-600 dark:text-violet-400">
              {formatPrice(finalPrice)}
            </div>
            {selectedVariant && Number(selectedVariant.additional_price) > 0 && (
              <span className="text-[10px] text-muted-foreground font-semibold">
                (Đã gồm {formatPrice(Number(selectedVariant.additional_price))} phụ phí phiên bản)
              </span>
            )}
          </div>

          {/* Variant Selectors Section */}
          {product.has_variants && product.variants && product.variants.length > 0 && (
            <div id="variant-selector-section" className="border-t border-zinc-100 dark:border-zinc-900/60 pt-5">
              <VariantSelector
                variants={product.variants}
                onVariantSelect={setSelectedVariant}
              />
            </div>
          )}

          {/* Quantity Selector Section */}
          <div className="border-t border-zinc-100 dark:border-zinc-900/60 pt-5 space-y-3">
            <div className="flex items-center justify-between text-sm font-bold text-muted-foreground uppercase tracking-wider">
              <span>Số lượng mua:</span>
              {!isOutOfStock && !isOwnProduct && (
                <span className="text-xs text-muted-foreground font-semibold">
                  Tồn kho khả dụng: <strong className="text-foreground">{maxStock} sản phẩm</strong>
                </span>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center border-2 border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden h-12 bg-white dark:bg-zinc-950 shrink-0">
                <button
                  type="button"
                  disabled={quantity <= 1 || isOutOfStock || isOwnProduct}
                  onClick={handleQtyMinus}
                  className="w-12 h-full flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent transition text-muted-foreground hover:text-foreground border-r dark:border-zinc-800"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="px-4 text-sm font-black text-foreground min-w-[50px] text-center select-none">
                  {isOutOfStock || isOwnProduct ? 0 : quantity}
                </span>
                <button
                  type="button"
                  disabled={quantity >= maxStock || isOutOfStock || isOwnProduct}
                  onClick={handleQtyPlus}
                  className="w-12 h-full flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent transition text-muted-foreground hover:text-foreground border-l dark:border-zinc-800"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Add to Cart CTA Button */}
              <button
                type="button"
                disabled={isOutOfStock || isOwnProduct}
                onClick={handleAddToCart}
                className="flex-1 h-12 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-zinc-300 disabled:to-zinc-300 dark:disabled:from-zinc-800 dark:disabled:to-zinc-800 disabled:text-zinc-500 text-white font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-md shadow-violet-500/20 disabled:shadow-none cursor-pointer"
              >
                <ShoppingCart className="h-4 w-4" />
                <span>
                  {isOwnProduct 
                    ? "Sản phẩm của Shop bạn" 
                    : isOutOfStock 
                      ? "Tạm hết hàng" 
                      : "Thêm vào giỏ hàng"}
                </span>
              </button>
            </div>
          </div>

          {/* Trust Guarantees */}
          <div className="border-t border-zinc-100 dark:border-zinc-900/60 pt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground font-semibold">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>Chính hãng 100%</span>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-violet-500 shrink-0" />
              <span>Giao hàng toàn quốc</span>
            </div>
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-amber-500 shrink-0" />
              <span>Đổi trả 7 ngày</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs description */}
      <div className="rounded-2xl border bg-white dark:bg-zinc-950 p-6 sm:p-8 space-y-6 shadow-sm">
        <div className="border-b pb-4 flex gap-8">
          <span className="text-base font-extrabold text-violet-600 border-b-2 border-violet-600 pb-4 -mb-[18px] flex items-center gap-1.5 cursor-pointer">
            <Sparkles className="h-4 w-4" /> Chi tiết sản phẩm
          </span>
        </div>

        <div className="space-y-4 pt-2">
          {product.description ? (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {product.description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Hiện chưa có mô tả chi tiết cho sản phẩm này.
            </p>
          )}

          {/* Technical Specifications */}
          <div className="pt-4 max-w-md">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">
              Thông số kỹ thuật:
            </h4>
            <div className="divide-y text-xs border rounded-xl overflow-hidden bg-zinc-50/50 dark:bg-zinc-900/10">
              <div className="flex p-3">
                <span className="w-1/3 text-muted-foreground font-semibold">Trọng lượng</span>
                <span className="w-2/3 text-foreground font-bold">{product.weight}g</span>
              </div>
              <div className="flex p-3">
                <span className="w-1/3 text-muted-foreground font-semibold">Kích thước hộp</span>
                <span className="w-2/3 text-foreground font-bold">
                  {product.length || 20} x {product.width || 15} x {product.height || 10} cm
                </span>
              </div>
              <div className="flex p-3">
                <span className="w-1/3 text-muted-foreground font-semibold">Mã SKU gốc</span>
                <span className="w-2/3 text-foreground font-mono font-bold">
                  {product.sku || "N/A"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section sản phẩm đã xem gần đây */}
      <RecentlyViewedCarousel currentProductId={product.id} />

      {/* Sticky Buy Bar on Mobile */}
      {showStickyBar && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-t px-4 py-3 flex items-center justify-between gap-4 animate-fade-in shadow-[0_-4px_12px_rgba(0,0,0,0.05)] border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800">
              <Image
                src={activeImageUrl || product.thumbnail_url || "/placeholder-product.png"}
                alt={product.name}
                fill
                sizes="40px"
                className="object-cover"
              />
            </div>
            <div className="min-w-0 flex flex-col">
              <span className="text-xs font-bold text-foreground truncate max-w-[120px] sm:max-w-[200px]">
                {product.name}
              </span>
              <span className="text-xs font-black text-violet-600 dark:text-violet-400">
                {formatPrice(finalPrice)}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={isOutOfStock || isOwnProduct}
            onClick={handleStickyAddToCart}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-zinc-300 disabled:to-zinc-300 dark:disabled:from-zinc-800 dark:disabled:to-zinc-800 disabled:text-zinc-500 text-white font-extrabold text-[10px] sm:text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-violet-500/20 disabled:shadow-none cursor-pointer"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            <span>
              {isOwnProduct 
                ? "Sản phẩm của Shop bạn" 
                : isOutOfStock 
                  ? "Tạm hết hàng" 
                  : "Thêm vào giỏ"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
