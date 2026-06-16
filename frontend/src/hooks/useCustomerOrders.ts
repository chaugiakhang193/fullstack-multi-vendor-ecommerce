import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import orderApiRequest from "@/apiRequests/orders/orders";
import { customerOrderKeys, STALE_TIME } from "@/constants/query-keys";
import { type OrderStatusType } from "@/schemaValidations/orders/orders.schema";

const LIMIT = 10;

/** Lịch sử đơn customer theo tab + page (chỉ chạy khi đã đăng nhập + hydrated). */
export const useCustomerOrdersList = (
  activeTab: OrderStatusType | "all",
  page: number,
  enabled: boolean
) => {
  return useQuery({
    queryKey: customerOrderKeys.list({ tab: activeTab, page }),
    queryFn: () => {
      const status = activeTab === "all" ? undefined : activeTab;
      return orderApiRequest.getOrders({ page, limit: LIMIT, status });
    },
    enabled,
    staleTime: STALE_TIME.SHORT,
  });
};

/** Chi tiết 1 master order customer. */
export const useCustomerOrderDetail = (id: string) => {
  return useQuery({
    queryKey: customerOrderKeys.detail(id),
    queryFn: () => orderApiRequest.getOrderDetail(id),
    enabled: !!id,
    staleTime: STALE_TIME.SHORT,
  });
};

/** Hủy 1 sub-order. Refetch là nguồn sự thật (không đọc response body). */
export const useCancelSubOrder = (
  orderId: string,
  callbacks?: { onSettled?: () => void }
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subOrderId: string) => orderApiRequest.cancelSubOrder(subOrderId),
    onSuccess: () => {
      toast.success("Đã hủy đơn hàng và hoàn kho thành công");
      queryClient.invalidateQueries({ queryKey: customerOrderKeys.detail(orderId) });
      queryClient.invalidateQueries({ queryKey: customerOrderKeys.all });
    },
    onSettled: () => callbacks?.onSettled?.(),
  });
};
