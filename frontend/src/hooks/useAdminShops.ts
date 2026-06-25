import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import adminShopsApiRequest from '@/apiRequests/shops/admin-shops';
import { pendingShopKeys, STALE_TIME } from '@/constants/query-keys';
import { RejectShopBodyType } from '@/schemaValidations/shops/shops.schema';

/** Danh sách cửa hàng chờ duyệt (admin). */
export const usePendingShops = () => {
  return useQuery({
    queryKey: pendingShopKeys.all,
    queryFn: () => {
      return adminShopsApiRequest.getPendingShops();
    },
    staleTime: STALE_TIME.SHORT,
  });
};

/** Admin phê duyệt cửa hàng. */
export const useApproveShop = (callbacks?: { onSuccess?: () => void }) => {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { showToastOnError: true },
    mutationFn: (shopId: string) => {
      const targetShopId = shopId;
      return adminShopsApiRequest.approveShop(targetShopId);
    },
    onSuccess: (res) => {
      const invalidateOptions = { queryKey: pendingShopKeys.all };
      queryClient.invalidateQueries(invalidateOptions);
      const successMsg = res.message || 'Đã phê duyệt cửa hàng.';
      toast.success(successMsg);
      callbacks?.onSuccess?.();
    },
  });
};

/** Admin từ chối cửa hàng. */
export const useRejectShop = (callbacks?: { onSuccess?: () => void }) => {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { showToastOnError: true },
    mutationFn: (variables: { shopId: string; body: RejectShopBodyType }) => {
      const targetShopId = variables.shopId;
      const rejectBody = variables.body;
      return adminShopsApiRequest.rejectShop(targetShopId, rejectBody);
    },
    onSuccess: (res) => {
      const invalidateOptions = { queryKey: pendingShopKeys.all };
      queryClient.invalidateQueries(invalidateOptions);
      const rejectMsg = res.message || 'Đã từ chối cửa hàng.';
      toast.success(rejectMsg);
      callbacks?.onSuccess?.();
    },
  });
};
