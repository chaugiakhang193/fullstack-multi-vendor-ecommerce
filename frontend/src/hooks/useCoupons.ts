import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import couponApiRequest from "@/apiRequests/promotions/coupons";
import { couponKeys, STALE_TIME } from "@/constants/query-keys";
import { CreateCouponBodyType, UpdateCouponBodyType, CouponQueryType } from "@/schemaValidations/promotions/coupons.schema";

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
    mutationFn: (body: CreateCouponBodyType) => couponApiRequest.adminCreate(body),
    onSuccess: () => {
      toast.success("Tạo mã giảm giá toàn sàn thành công");
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
  });
};

export const useAdminUpdateCoupon = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateCouponBodyType) => couponApiRequest.adminUpdate(id, body),
    onSuccess: () => {
      toast.success("Cập nhật mã giảm giá thành công");
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
  });
};

export const useAdminDeleteCoupon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => couponApiRequest.adminDelete(id),
    onSuccess: () => {
      toast.success("Xóa mã giảm giá thành công");
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
    mutationFn: (body: CreateCouponBodyType) => couponApiRequest.sellerCreate(body),
    onSuccess: () => {
      toast.success("Tạo mã giảm giá shop thành công");
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
  });
};

export const useSellerUpdateCoupon = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateCouponBodyType) => couponApiRequest.sellerUpdate(id, body),
    onSuccess: () => {
      toast.success("Cập nhật mã giảm giá shop thành công");
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
  });
};

export const useSellerDeleteCoupon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => couponApiRequest.sellerDelete(id),
    onSuccess: () => {
      toast.success("Xóa mã giảm giá thành công");
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
  });
};

// Customer Hooks
export const useBrowseCoupons = (query?: CouponQueryType) => {
  return useQuery({
    queryKey: couponKeys.browse(query),
    queryFn: () => couponApiRequest.browseClaimable(query),
    staleTime: STALE_TIME.SHORT,
  });
};

export const useWalletCoupons = (query?: CouponQueryType, enabled = true) => {
  return useQuery({
    queryKey: couponKeys.wallet(query),
    queryFn: () => couponApiRequest.getWallet(query),
    staleTime: STALE_TIME.SHORT,
    enabled,
  });
};

export const useClaimCoupon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => couponApiRequest.claim(id),
    onSuccess: () => {
      toast.success("Lưu mã giảm giá vào ví thành công!");
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
    onError: (error: any) => {
      toast.error(error?.payload?.message || "Không thể lưu mã giảm giá này");
    },
  });
};
