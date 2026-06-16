import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import sellerOrderApiRequest from "@/apiRequests/orders/seller-orders";
import { sellerOrderKeys, STALE_TIME } from "@/constants/query-keys";
import {
  type OrderStatusType,
  type UpdateOrderStatusBodyType,
} from "@/schemaValidations/orders/orders.schema";

const LIMIT = 10;

/** Danh sách đơn của seller theo tab + page. */
export const useSellerOrdersList = (
  activeTab: OrderStatusType | "all",
  page: number
) => {
  return useQuery({
    queryKey: sellerOrderKeys.list({ tab: activeTab, page }),
    queryFn: () => {
      const status = activeTab === "all" ? undefined : activeTab;
      return sellerOrderApiRequest.getSellerOrders({ page, limit: LIMIT, status });
    },
    staleTime: STALE_TIME.SHORT,
  });
};

/** Chi tiết 1 sub-order seller. */
export const useSellerOrderDetail = (id: string) => {
  return useQuery({
    queryKey: sellerOrderKeys.detail(id),
    queryFn: () => sellerOrderApiRequest.getSellerOrderDetail(id),
    enabled: !!id,
    staleTime: STALE_TIME.SHORT,
  });
};

/**
 * Cập nhật trạng thái đơn (state machine). Đóng gói toast success + invalidate
 * cả list lẫn detail (theo root → match mọi key con). Error toast do
 * mutationCache.onError global lo. callbacks tùy chọn để page dọn state cục bộ.
 */
export const useUpdateSellerOrderStatus = (callbacks?: {
  onSuccess?: () => void;
  onSettled?: () => void;
}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: UpdateOrderStatusBodyType }) =>
      sellerOrderApiRequest.updateSellerOrderStatus(vars.id, vars.body),
    onSuccess: () => {
      toast.success("Cập nhật trạng thái đơn hàng thành công");
      queryClient.invalidateQueries({ queryKey: sellerOrderKeys.all });
      queryClient.invalidateQueries({ queryKey: sellerOrderKeys.detailAll });
      callbacks?.onSuccess?.();
    },
    onSettled: () => callbacks?.onSettled?.(),
  });
};
