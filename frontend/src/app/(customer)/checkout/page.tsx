"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MapPin,
  Plus,
  Tag,
  Truck,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  ShoppingBag,
  Check,
} from "lucide-react";

// Components
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { AddressFormModal } from "@/components/profile/address-form-modal";
import { AddressPicker } from "@/components/orders/address-picker";
import { ShopCard } from "@/components/orders/shop-card";

// Hooks & stores
import useHydrated from "@/hooks/useHydrated";
import { useAddresses } from "@/hooks/useAddresses";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";

// API
import orderApiRequest from "@/apiRequests/orders/orders";
import { getErrorMessage, HttpError } from "@/lib/http";

// Constants & types
import { QUERY_KEYS } from "@/constants/query-keys";
import { HTTP_STATUS } from "@/constants/http-status";
import { cn } from "@/lib/utils";
import { formatVnd } from "@/lib/format";
import type {
  CheckoutBodyType,
  PreviewShopType,
} from "@/schemaValidations/orders/orders.schema";
import type { AddressResponseType } from "@/schemaValidations/users/addresses.schema";


export default function CheckoutPage() {
  const router = useRouter();
  const isHydrated = useHydrated();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { addresses, isLoading: addressesLoading } = useAddresses();
  const clearGuestCart = useCartStore((s) => s.clearCart);

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Coupon: tách "đang nhập" và "đã áp dụng" — chỉ giá trị đã áp dụng đẩy vào preview.
  const [globalCouponInput, setGlobalCouponInput] = useState("");
  const [globalCouponApplied, setGlobalCouponApplied] = useState("");
  const [shopCouponInputs, setShopCouponInputs] = useState<Record<string, string>>({});
  const [shopCouponsApplied, setShopCouponsApplied] = useState<Record<string, string>>({});

  // Idempotency-Key đại diện cho MỘT ý định đặt đơn: giữ ổn định để retry (mất response)
  // được backend dedupe, nhưng sinh key mới khi đổi địa chỉ/coupon (ý định đơn đã khác).
  // KHÔNG sinh theo mỗi click — nút đã disable khi pending nên double-click đã được chặn,
  // còn sinh-mỗi-click sẽ phá dedup và tạo đơn trùng khi response bị mất.
  const idempotencyKeyRef = useRef<string>(
    typeof crypto !== "undefined" ? crypto.randomUUID() : "",
  );
  useEffect(() => {
    if (typeof crypto !== "undefined") {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
  }, [selectedAddressId, globalCouponApplied, shopCouponsApplied]);

  // Redirect nếu chưa đăng nhập (sau hydrate để tránh nhấp nháy).
  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      const message = "Vui lòng đăng nhập để thanh toán!";
      toast.error(message);
      // Kèm redirect để sau khi đăng nhập user quay lại đúng /checkout (login-form đọc
      // param `redirect`), tránh bị văng về home — đồng bộ pattern với trang orders.
      const loginPath = "/login?redirect=%2Fcheckout";
      router.replace(loginPath);
    }
  }, [isHydrated, isAuthenticated, router]);

  // Chọn địa chỉ mặc định khi danh sách load xong.
  useEffect(() => {
    if (selectedAddressId || addresses.length === 0) return;
    const defaultAddress = addresses.find((a) => a.is_default) ?? addresses[0];
    const addressId = defaultAddress.id;
    setSelectedAddressId(addressId);
  }, [addresses, selectedAddressId]);

  const shopCouponsArray = useMemo(() => {
    const appliedEntries = Object.entries(shopCouponsApplied);
    const nonEmptyEntries = appliedEntries.filter(([, code]) => !!code);
    return nonEmptyEntries.map(([shop_id, coupon_code]) => ({
      shop_id,
      coupon_code,
    }));
  }, [shopCouponsApplied]);

  // Preview query — chạy lại khi địa chỉ / coupon thay đổi.
  const previewQueryKey = [
    QUERY_KEYS.CHECKOUT_PREVIEW,
    selectedAddressId,
    globalCouponApplied,
    shopCouponsArray,
  ];
  const isPreviewEnabled = !!selectedAddressId && isAuthenticated;
  const previewQuery = useQuery({
    queryKey: previewQueryKey,
    queryFn: ({ signal }) => {
      const body = {
        address_id: selectedAddressId as string,
        global_coupon_code: globalCouponApplied || undefined,
        shop_coupons: shopCouponsArray.length > 0 ? shopCouponsArray : undefined,
      };
      return orderApiRequest.checkoutPreview(body, { signal });
    },
    enabled: isPreviewEnabled,
    staleTime: 0, // Luôn coi dữ liệu checkout preview là cũ để fetch lại khi thay đổi địa chỉ/coupon
  });

  const preview = previewQuery.data?.data;
  const shops = preview?.shops ?? [];
  // Backend trả HTTP 400 "Giỏ hàng trống, không thể xem trước" khi giỏ rỗng
  // (không phải shops=[]). Bắt riêng để render Empty State thay vì banner đỏ.
  // KHÔNG nuốt mọi 400 vì coupon không hợp lệ cũng 400 (message khác).
  const previewError = previewQuery.error;
  const isEmptyCartError =
    previewError instanceof HttpError &&
    previewError.status === HTTP_STATUS.BAD_REQUEST &&
    typeof previewError.payload?.message === "string" &&
    previewError.payload.message.includes("Giỏ hàng trống");
  const isCartEmpty =
    (previewQuery.isSuccess && shops.length === 0) || isEmptyCartError;
  // Chặn đặt hàng chủ động khi có item "Hết hàng" (BE vẫn là chốt chặn cuối).
  // Lưu ý: "Chỉ còn X sản phẩm" vẫn mua được nên KHÔNG chặn.
  const hasOutOfStockItem = shops.some((shop) => {
    const items = shop.items;
    return items.some((item) => item.stock_warning === "Hết hàng");
  });

  // Đặt đơn.
  const checkoutMutation = useMutation({
    mutationFn: (body: CheckoutBodyType) => {
      const idempotencyKey = idempotencyKeyRef.current;
      return orderApiRequest.checkout(body, idempotencyKey);
    },
    onSuccess: async (res) => {
      const data = res.data;
      // Backend đã rỗng server-cart khi checkout. FE chỉ cần dọn store guest (nếu còn)
      // + invalidate query cart để các nơi khác refetch về giỏ trống.
      clearGuestCart();
      const cartQueryFilter = { queryKey: [QUERY_KEYS.CART] };
      await queryClient.invalidateQueries(cartQueryFilter);
      const successQuery = {
        orderNumber: data.order_number,
        orderId: data.order_id,
      };
      const params = new URLSearchParams(successQuery);
      const successUrl = `/checkout/success?${params.toString()}`;
      router.push(successUrl);
    },
    onError: (error) => {
      const message = getErrorMessage(error);
      toast.error(message);
    },
  });

  // ===== Handlers =====
  const handleOpenAddressModal = () => {
    setModalOpen(true);
  };

  const handleGoProducts = () => {
    const productsPath = "/products";
    router.push(productsPath);
  };

  const handleGlobalCouponInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setGlobalCouponInput(value);
  };

  const handleApplyGlobalCoupon = () => {
    const code = globalCouponInput.trim();
    if (code) setGlobalCouponApplied(code);
  };

  const handleClearGlobalCoupon = () => {
    setGlobalCouponInput("");
    setGlobalCouponApplied("");
  };

  const handleShopCouponInputChange = (shopId: string, value: string) => {
    setShopCouponInputs((prev) => {
      const next = { ...prev, [shopId]: value };
      return next;
    });
  };

  const handleApplyShopCoupon = (shopId: string) => {
    const existingInput = shopCouponInputs[shopId] ?? "";
    const code = existingInput.trim();
    if (!code) return;
    setShopCouponsApplied((prev) => {
      const next = { ...prev, [shopId]: code };
      return next;
    });
  };

  const handleClearShopCoupon = (shopId: string) => {
    setShopCouponInputs((prev) => {
      const next = { ...prev, [shopId]: "" };
      return next;
    });
    setShopCouponsApplied((prev) => {
      const next = { ...prev };
      delete next[shopId];
      return next;
    });
  };

  const handlePlaceOrder = () => {
    if (!selectedAddressId) {
      const message = "Vui lòng chọn địa chỉ giao hàng!";
      toast.error(message);
      return;
    }
    const body: CheckoutBodyType = {
      address_id: selectedAddressId,
      payment_method: "cod",
      global_coupon_code: globalCouponApplied || undefined,
      shop_coupons: shopCouponsArray.length > 0 ? shopCouponsArray : undefined,
    };
    checkoutMutation.mutate(body);
  };

  // ===== Loading skeleton =====
  if (!isHydrated || (isAuthenticated && addressesLoading)) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-10 animate-pulse">
        <div className="h-9 w-56 bg-muted rounded-xl mb-8" />
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-6">
            <div className="h-40 bg-muted rounded-xl" />
            <div className="h-72 bg-muted rounded-xl" />
          </div>
          <div className="lg:col-span-4 h-80 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  // Nhãn tiền tệ cho panel tóm tắt — gán biến tường minh trước khi format.
  let totalShippingLabel = "—";
  let totalDiscountLabel = formatVnd.format(0);
  let totalAmountLabel = "—";
  if (preview) {
    const totalShippingFee = preview.totalShippingFee;
    totalShippingLabel = formatVnd.format(totalShippingFee);
    const totalDiscount = preview.totalDiscount;
    totalDiscountLabel =
      totalDiscount > 0 ? `- ${formatVnd.format(totalDiscount)}` : formatVnd.format(0);
    const totalAmount = preview.totalAmount;
    totalAmountLabel = formatVnd.format(totalAmount);
  }

  const isPlaceOrderDisabled =
    !selectedAddressId ||
    !preview ||
    previewQuery.isFetching ||
    checkoutMutation.isPending ||
    hasOutOfStockItem;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-10 space-y-8 animate-fade-in pb-24 lg:pb-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Thanh toán
        </h1>
        <p className="text-sm text-muted-foreground font-semibold">
          Kiểm tra lại đơn hàng và hoàn tất đặt hàng của bạn.
        </p>
      </div>

      {isCartEmpty ? (
        <EmptyState
          icon={<ShoppingBag className="w-8 h-8" />}
          title="Giỏ hàng trống"
          description="Bạn chưa có sản phẩm nào để thanh toán."
          actionLabel="Tiếp tục mua sắm"
          onAction={handleGoProducts}
        />
      ) : (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left */}
          <div className="lg:col-span-8 space-y-6">
            <AddressPicker
              addresses={addresses}
              selectedId={selectedAddressId}
              onSelect={setSelectedAddressId}
              onAddNew={handleOpenAddressModal}
            />

            {previewQuery.isError && !isEmptyCartError && (
              <div className="bg-card border border-rose-200 dark:border-rose-900/40 rounded-xl p-6 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                {getErrorMessage(previewQuery.error)}
              </div>
            )}

            {previewQuery.isLoading ? (
              <div className="bg-card border rounded-xl p-12 flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-violet-500 animate-spin" />
              </div>
            ) : (
              shops.map((shop) => {
                const shopId = shop.shopId;
                const couponInput = shopCouponInputs[shopId] ?? "";
                const appliedCoupon = shopCouponsApplied[shopId] ?? "";
                // Closure mỏng truyền shopId (biến tường minh) vào handler cấp page.
                const handleInputChange = (value: string) =>
                  handleShopCouponInputChange(shopId, value);
                const handleApply = () => handleApplyShopCoupon(shopId);
                const handleClear = () => handleClearShopCoupon(shopId);
                return (
                  <ShopCard
                    key={shopId}
                    shop={shop}
                    couponInput={couponInput}
                    appliedCoupon={appliedCoupon}
                    onCouponInputChange={handleInputChange}
                    onApplyCoupon={handleApply}
                    onClearCoupon={handleClear}
                  />
                );
              })
            )}
          </div>

          {/* Right: summary */}
          <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-6">
            <div className="bg-card border rounded-xl p-6 shadow-xs space-y-4">
              <h3 className="text-base font-black text-foreground border-b pb-3 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Tóm tắt đơn hàng
              </h3>

              {/* Global coupon */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">
                  Mã giảm giá toàn sàn
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={globalCouponInput}
                      onChange={handleGlobalCouponInputChange}
                      placeholder="Nhập mã"
                      className="w-full h-9 pl-9 pr-3 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                    />
                  </div>
                  {globalCouponApplied ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearGlobalCoupon}
                    >
                      Bỏ mã
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleApplyGlobalCoupon}
                      disabled={!globalCouponInput.trim()}
                    >
                      Áp dụng
                    </Button>
                  )}
                </div>
              </div>

              {/* Totals */}
              <div className="border-t pt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Phí vận chuyển</span>
                  <span className="font-medium text-foreground">
                    {totalShippingLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Giảm giá</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {totalDiscountLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="font-black text-foreground">Tổng cộng</span>
                  <span className="text-xl font-black text-violet-600 dark:text-violet-400">
                    {totalAmountLabel}
                  </span>
                </div>
              </div>

              {/* Payment method */}
              <div className="border-t pt-3">
                <p className="text-xs font-bold text-muted-foreground uppercase mb-2">
                  Phương thức thanh toán
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-violet-500 bg-violet-50/50 dark:bg-violet-950/20 px-3 py-2.5 text-sm font-semibold text-foreground">
                  <Truck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  Thanh toán khi nhận hàng (COD)
                </div>
              </div>

              {hasOutOfStockItem && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Có sản phẩm đã hết hàng. Vui lòng quay lại giỏ hàng để bỏ trước
                  khi đặt.
                </p>
              )}

              <Button
                className="w-full h-11 text-base font-bold"
                disabled={isPlaceOrderDisabled}
                onClick={handlePlaceOrder}
              >
                {checkoutMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Đang đặt hàng...
                  </>
                ) : (
                  "Đặt hàng"
                )}
              </Button>

              <Link
                href="/cart"
                className="block text-center text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                ← Quay lại giỏ hàng
              </Link>
            </div>
          </div>
        </div>
      )}

      <AddressFormModal open={modalOpen} onOpenChange={setModalOpen} editing={null} />
    </div>
  );
}
