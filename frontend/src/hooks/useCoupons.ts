import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import couponApiRequest from '@/apiRequests/promotions/coupons';
import { couponKeys, STALE_TIME } from '@/constants/query-keys';
import { useAuthStore } from '@/store/useAuthStore';
import {
  CreateCouponBodyType,
  UpdateCouponBodyType,
  CouponQueryType,
} from '@/schemaValidations/promotions/coupons.schema';

// Admin Hooks
export const useAdminCoupons = (query?: CouponQueryType) => {
  return useQuery({
    queryKey: couponKeys.adminList(query),
    queryFn: () => couponApiRequest.adminGetList(query),
    staleTime: STALE_TIME.SHORT,
  });
};

export const useAdminCreateCoupon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCouponBodyType) =>
      couponApiRequest.adminCreate(body),
    onSuccess: () => {
      toast.success('Tạo mã giảm giá toàn sàn thành công');
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
  });
};

export const useAdminUpdateCoupon = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateCouponBodyType) =>
      couponApiRequest.adminUpdate(id, body),
    onSuccess: () => {
      toast.success('Cập nhật mã giảm giá thành công');
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
  });
};

export const useAdminDeleteCoupon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => couponApiRequest.adminDelete(id),
    onSuccess: () => {
      toast.success('Xóa mã giảm giá thành công');
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
  });
};

// Seller Hooks
export const useSellerCoupons = (query?: CouponQueryType) => {
  return useQuery({
    queryKey: couponKeys.sellerList(query),
    queryFn: () => couponApiRequest.sellerGetList(query),
    staleTime: STALE_TIME.SHORT,
  });
};

export const useSellerCreateCoupon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCouponBodyType) =>
      couponApiRequest.sellerCreate(body),
    onSuccess: () => {
      toast.success('Tạo mã giảm giá shop thành công');
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
  });
};

export const useSellerUpdateCoupon = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateCouponBodyType) =>
      couponApiRequest.sellerUpdate(id, body),
    onSuccess: () => {
      toast.success('Cập nhật mã giảm giá shop thành công');
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
  });
};

export const useSellerDeleteCoupon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => couponApiRequest.sellerDelete(id),
    onSuccess: () => {
      toast.success('Xóa mã giảm giá thành công');
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
  });
};

// Customer Hooks
export const useBrowseCoupons = (query?: CouponQueryType) => {
  // is_claimed do backend tính theo user đăng nhập → guest và user PHẢI tách cache
  // riêng, nếu không cache của guest (is_claimed=false) sẽ "đè" lên kết quả của user
  // ngay sau khi đăng nhập (trong khoảng staleTime), khiến badge "Đã lưu" không hiện.
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: [...couponKeys.browse(query), isAuthenticated],
    queryFn: () => couponApiRequest.browseClaimable(query),
    staleTime: STALE_TIME.SHORT,
    // Đồng bộ đa tab: claim ở tab khác (queryClient riêng) không invalidate được tab này,
    // nên refetch khi cửa sổ được focus lại để badge "Đã lưu" cập nhật mà không cần F5.
    refetchOnWindowFocus: true,
  });
};

export const useWalletCoupons = (query?: CouponQueryType, enabled = true) => {
  return useQuery({
    queryKey: couponKeys.wallet(query),
    queryFn: () => couponApiRequest.getWallet(query),
    // staleTime 0 + refetchOnWindowFocus: khi chuyển sang tab ví, luôn refetch để thấy
    // ngay coupon vừa claim ở tab khác (ADV-4 tab syncing) — không phụ thuộc cửa sổ staleTime.
    staleTime: 0,
    refetchOnWindowFocus: true,
    enabled,
  });
};

export const useClaimCoupon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => couponApiRequest.claim(id),
    // Nút bấm không có form → ép handler lỗi toàn cục (mutationCache.onError) hiện toast
    // cho cả lỗi 400 ("hết hạn"/"hết lượt") lẫn 409 ("đã lưu rồi"). Không tự thêm onError
    // ở đây để tránh toast TRÙNG với handler tập trung.
    meta: { showToastOnError: true },
    onSuccess: () => {
      toast.success('Lưu mã giảm giá vào ví thành công!');
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
  });
};
