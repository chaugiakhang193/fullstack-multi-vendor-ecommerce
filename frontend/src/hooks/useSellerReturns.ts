import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import sellerReturnApiRequest from '@/apiRequests/returns/seller-returns';
import { getErrorMessage } from '@/lib/http';
import { sellerReturnKeys, STALE_TIME } from '@/constants/query-keys';
import type { RejectReturnBodyType } from '@/schemaValidations/returns/returns.schema';

const LIMIT = 10;

export const useSellerReturns = (page = 1) =>
  useQuery({
    queryKey: sellerReturnKeys.list({ page }),
    queryFn: () => sellerReturnApiRequest.getList({ page, limit: LIMIT }),
    staleTime: STALE_TIME.SHORT,
  });

export const useSellerReturnDetail = (id: string) =>
  useQuery({
    queryKey: sellerReturnKeys.detail(id),
    queryFn: () => sellerReturnApiRequest.getDetail(id),
    enabled: !!id,
    staleTime: STALE_TIME.SHORT,
  });

export const useApproveReturn = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sellerReturnApiRequest.approve(id),
    onSuccess: () => {
      toast.success('Đã duyệt yêu cầu trả hàng');
      queryClient.invalidateQueries({ queryKey: sellerReturnKeys.all });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
};

export const useReceiveReturn = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sellerReturnApiRequest.receive(id),
    onSuccess: () => {
      toast.success('Đã xác nhận nhận hàng trả — kho đã được cộng lại');
      queryClient.invalidateQueries({ queryKey: sellerReturnKeys.all });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
};

export const useRejectReturn = (callbacks?: { onSuccess?: () => void }) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: RejectReturnBodyType }) =>
      sellerReturnApiRequest.reject(vars.id, vars.body),
    onSuccess: () => {
      toast.success('Đã từ chối yêu cầu trả hàng');
      queryClient.invalidateQueries({ queryKey: sellerReturnKeys.all });
      callbacks?.onSuccess?.();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
};
