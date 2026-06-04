"use client";

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { HttpError } from "@/lib/http";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bug,
  Globe,
  Lock,
  RefreshCw,
  Server,
  ShoppingCart,
  Database,
} from "lucide-react";
import CartConflictDialog, { ConflictItem } from "@/components/cart/CartConflictDialog";
import { useCartStore } from "@/store/useCartStore";
import { CartConflictReason } from "@/constants/enum";

// Component con để kích hoạt lỗi crash JavaScript khi render
function CrashingComponent() {
  if (typeof window !== "undefined") {
    throw new Error("Lỗi crash giả lập từ CrashingComponent tại trang test-error!");
  }
  return null;
}

export default function TestErrorPage() {
  const [shouldCrash, setShouldCrash] = useState(false);
  const [isConflictOpen, setIsConflictOpen] = useState(false);

  // 1. Giả lập lỗi 500
  const mutation500 = useMutation({
    mutationFn: async () => {
      // Ném ra HttpError 500 để trigger MutationCache.onError
      throw new HttpError({
        status: 500,
        payload: { message: "Internal Server Error" },
      });
    },
  });

  // 2. Giả lập lỗi 403
  const mutation403 = useMutation({
    mutationFn: async () => {
      throw new HttpError({
        status: 403,
        payload: { message: "Bạn không có quyền truy cập tài nguyên này." },
      });
    },
  });

  // 3. Giả lập lỗi 400/422 Validation thông thường (Mặc định không hiện toast)
  const mutation400Normal = useMutation({
    mutationFn: async () => {
      throw new HttpError({
        status: 400,
        payload: { message: "Email đã tồn tại trong hệ thống." },
      });
    },
  });

  // 4. Giả lập lỗi 400/422 Validation có ép buộc hiện Toast (showToastOnError: true)
  const mutation400Forced = useMutation({
    mutationFn: async () => {
      throw new HttpError({
        status: 400,
        payload: { message: "Dữ liệu giỏ hàng không hợp lệ (Bắt buộc hiện Toast)!" },
      });
    },
    meta: {
      showToastOnError: true,
    },
  });

  // 5. Giả lập lỗi Offline (Failed to fetch)
  const mutationOffline = useMutation({
    mutationFn: async () => {
      throw new TypeError("Failed to fetch");
    },
  });

  // Danh sách sản phẩm xung đột mẫu để test CartConflictDialog
  const mockConflicts: ConflictItem[] = [
    {
      productId: "prod-1",
      variantId: null,
      reason: CartConflictReason.PRICE_CHANGED,
      oldPrice: 150000,
      newPrice: 180000,
      productName: "Áo thun Nam Premium",
    },
    {
      productId: "prod-2",
      variantId: "var-1",
      reason: CartConflictReason.OUT_OF_STOCK,
      availableStock: 2,
      productName: "Giày Sneaker Unisex",
      variantName: "Size 41, Màu Trắng",
    },
    {
      productId: "prod-3",
      variantId: "var-2",
      reason: CartConflictReason.OUT_OF_STOCK,
      availableStock: 0,
      productName: "Mũ lưỡi trai phong cách",
      variantName: "Màu Đen",
    },
    {
      productId: "prod-4",
      variantId: null,
      reason: CartConflictReason.PRODUCT_DELETED,
      productName: "Sản phẩm không còn tồn tại",
    },
    {
      productId: "prod-5",
      variantId: null,
      reason: CartConflictReason.PRODUCT_HIDDEN,
      productName: "Sách phát triển bản thân",
    },
    {
      productId: "prod-6",
      variantId: null,
      reason: CartConflictReason.SHOP_INACTIVE,
      productName: "Tai nghe không dây TrueWireless",
    },
  ];

  // Nạp giỏ hàng mẫu vào Zustand store
  const handleSeedCart = () => {
    useCartStore.setState({
      items: [
        {
          productId: "prod-1",
          variantId: null,
          quantity: 1,
          name: "Áo thun Nam Premium",
          price: 150000,
          thumbnailUrl: "https://picsum.photos/seed/prod1/200",
          shopId: "shop-1",
          shopName: "Giang Kha Store",
          productSlug: "ao-thun-nam-premium",
          variants: [],
          basePrice: 150000,
          hasVariants: false,
          baseStock: 10,
        },
        {
          productId: "prod-2",
          variantId: "var-1",
          quantity: 5,
          name: "Giày Sneaker Unisex",
          price: 850000,
          thumbnailUrl: "https://picsum.photos/seed/prod2/200",
          shopId: "shop-1",
          shopName: "Giang Kha Store",
          productSlug: "giay-sneaker-unisex",
          variants: [
            {
              id: "var-1",
              name: "Size 41, Màu Trắng",
              additional_price: 0,
              stock_quantity: 10,
              sku: "SNEAKER-W-41",
              images: ["https://picsum.photos/seed/prod2/200"],
            },
          ],
          basePrice: 850000,
          hasVariants: true,
          baseStock: 10,
        },
        {
          productId: "prod-3",
          variantId: "var-2",
          quantity: 2,
          name: "Mũ lưỡi trai phong cách",
          price: 120000,
          thumbnailUrl: "https://picsum.photos/seed/prod3/200",
          shopId: "shop-2",
          shopName: "Vogue Access",
          productSlug: "mu-luoi-trai-phong-cach",
          variants: [
            {
              id: "var-2",
              name: "Màu Đen",
              additional_price: 0,
              stock_quantity: 5,
              sku: "HAT-B",
              images: ["https://picsum.photos/seed/prod3/200"],
            },
          ],
          basePrice: 120000,
          hasVariants: true,
          baseStock: 5,
        },
        {
          productId: "prod-4",
          variantId: null,
          quantity: 1,
          name: "Sản phẩm không còn tồn tại",
          price: 99000,
          thumbnailUrl: "https://picsum.photos/seed/prod4/200",
          shopId: "shop-2",
          shopName: "Vogue Access",
          productSlug: "san-pham-khong-ton-tai",
          variants: [],
          basePrice: 99000,
          hasVariants: false,
          baseStock: 0,
        },
        {
          productId: "prod-5",
          variantId: null,
          quantity: 2,
          name: "Sách phát triển bản thân",
          price: 135000,
          thumbnailUrl: "https://picsum.photos/seed/prod5/200",
          shopId: "shop-3",
          shopName: "Trí Tuệ Book",
          productSlug: "sach-phat-trien-ban-than",
          variants: [],
          basePrice: 135000,
          hasVariants: false,
          baseStock: 20,
        },
        {
          productId: "prod-6",
          variantId: null,
          quantity: 1,
          name: "Tai nghe không dây TrueWireless",
          price: 690000,
          thumbnailUrl: "https://picsum.photos/seed/prod6/200",
          shopId: "shop-4",
          shopName: "TechZone Store",
          productSlug: "tai-nghe-khong-day-truewireless",
          variants: [],
          basePrice: 690000,
          hasVariants: false,
          baseStock: 15,
        },
      ],
    });
    toast.success("Đã nạp dữ liệu giỏ hàng mẫu thành công!");
  };

  if (shouldCrash) {
    return <CrashingComponent />;
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto p-6 animate-fade-in">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Trang Kiểm Thử Sự Cố (Diagnostic Portal)
        </h1>
        <p className="text-sm text-muted-foreground">
          Trang ẩn chuyên biệt phục vụ kiểm nghiệm toàn diện các tầng xử lý lỗi, toast và error boundaries của ứng dụng.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Nhóm 1: Error Boundaries */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Bug className="h-5 w-5 text-violet-500" />
            Next.js Error Boundaries
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Kiểm nghiệm trang lỗi tùy chỉnh (Customer-level Error Boundary). Khi nhấn nút bên dưới, component con sẽ ném ra lỗi runtime JavaScript trong quá trình render.
          </p>
          <button
            onClick={() => setShouldCrash(true)}
            className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition active:scale-[0.98] cursor-pointer shadow-sm shadow-rose-500/20"
          >
            <AlertTriangle className="h-4 w-4" />
            <span>Kích hoạt Crash Javascript (Error Boundary)</span>
          </button>
        </div>

        {/* Nhóm 2: Xung đột nghiệp vụ */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-violet-500" />
            Xung đột giỏ hàng khi Checkout
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Kiểm nghiệm Dialog xử lý xung đột giỏ hàng (`CartConflictDialog`) khi thanh toán. Hãy nhấn nút nạp giỏ hàng trước, sau đó mở dialog giả lập để quan sát và thực thi sửa đổi.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleSeedCart}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 border rounded-lg text-xs font-semibold hover:bg-muted transition active:scale-[0.98] cursor-pointer bg-background"
            >
              <Database className="h-4 w-4 text-emerald-500" />
              <span>Nạp giỏ hàng mẫu</span>
            </button>
            <button
              onClick={() => setIsConflictOpen(true)}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 bg-violet-600 text-white hover:bg-violet-700 rounded-lg text-xs font-semibold transition active:scale-[0.98] cursor-pointer"
            >
              <ShoppingCart className="h-4 w-4" />
              <span>Mở Dialog Xung Đột</span>
            </button>
          </div>
        </div>
      </div>

      {/* Nhóm 3: Xử lý Toast toàn cục từ React Query */}
      <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Server className="h-5 w-5 text-violet-500" />
          Centralized API Error Toasts (React Query Mutation Cache)
        </h3>
        <p className="text-xs text-muted-foreground">
          Bấm các nút bên dưới để trigger mutation ném ra các HttpError tương ứng. Hệ thống xử lý lỗi tập trung sẽ tự động bắt lỗi và hiển thị Toast phù hợp.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {/* Nút Lỗi 500 */}
          <button
            onClick={() => mutation500.mutate()}
            className="flex items-center justify-center space-x-1.5 py-2 px-3 border rounded-lg text-xs font-semibold hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-500 transition active:scale-[0.98] cursor-pointer bg-background"
          >
            <Server className="h-4 w-4" />
            <span>Lỗi 500 (Hệ thống)</span>
          </button>

          {/* Nút Lỗi 403 */}
          <button
            onClick={() => mutation403.mutate()}
            className="flex items-center justify-center space-x-1.5 py-2 px-3 border rounded-lg text-xs font-semibold hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-500 transition active:scale-[0.98] cursor-pointer bg-background"
          >
            <Lock className="h-4 w-4" />
            <span>Lỗi 403 (Quyền truy cập)</span>
          </button>

          {/* Nút Lỗi Mất mạng */}
          <button
            onClick={() => mutationOffline.mutate()}
            className="flex items-center justify-center space-x-1.5 py-2 px-3 border rounded-lg text-xs font-semibold hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-500 transition active:scale-[0.98] cursor-pointer bg-background"
          >
            <Globe className="h-4 w-4" />
            <span>Lỗi Offline (Mất mạng)</span>
          </button>

          {/* Nút Lỗi 400 Form (Ẩn Toast) */}
          <button
            onClick={() => mutation400Normal.mutate()}
            className="flex items-center justify-center space-x-1.5 py-2 px-3 border rounded-lg text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 transition active:scale-[0.98] cursor-pointer bg-background"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Lỗi 400 (Ẩn Toast Form)</span>
          </button>

          {/* Nút Lỗi 400 Bắt buộc hiện Toast */}
          <button
            onClick={() => mutation400Forced.mutate()}
            className="flex items-center justify-center space-x-1.5 py-2 px-3 border rounded-lg text-xs font-semibold hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-500 transition active:scale-[0.98] cursor-pointer bg-background"
          >
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Lỗi 400 (Hiện Toast)</span>
          </button>
        </div>
      </div>

      {/* Cart Conflict Dialog Wrapper */}
      <CartConflictDialog
        isOpen={isConflictOpen}
        onOpenChange={setIsConflictOpen}
        conflicts={mockConflicts}
        onResolve={() => {
          toast.success("Xung đột giỏ hàng đã được giải quyết thành công!");
        }}
      />
    </div>
  );
}
