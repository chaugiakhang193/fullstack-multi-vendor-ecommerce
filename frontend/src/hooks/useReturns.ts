import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import returnApiRequest from '@/apiRequests/returns/returns';
import { getErrorMessage } from '@/lib/http';
import {
  returnKeys,
  customerOrderKeys,
  STALE_TIME,
} from '@/constants/query-keys';
import type { CreateReturnBodyType } from '@/schemaValidations/returns/returns.schema';

const LIMIT = 10;

export const useMyReturns = (page = 1, enabled = true) =>
  useQuery({
    queryKey: returnKeys.list({ page }),
    queryFn: () => returnApiRequest.getMine({ page, limit: LIMIT }),
    enabled,
    staleTime: STALE_TIME.SHORT,
  });

export const useReturnDetail = (id: string) =>
  useQuery({
    queryKey: returnKeys.detail(id),
    queryFn: () => returnApiRequest.getDetail(id),
    enabled: !!id,
    staleTime: STALE_TIME.SHORT,
  });

// Tạo yêu cầu trả. orderId để invalidate lại order detail (nút "Trả hàng" phụ thuộc).
export const useCreateReturn = (
  orderId: string,
  callbacks?: { onSuccess?: () => void },
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReturnBodyType) => returnApiRequest.create(body),
    onSuccess: () => {
      toast.success('Đã gửi yêu cầu trả hàng — chờ shop duyệt');
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
      queryClient.invalidateQueries({
        queryKey: customerOrderKeys.detail(orderId),
      });
      callbacks?.onSuccess?.();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
};

export const useCancelReturn = (callbacks?: { onSettled?: () => void }) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => returnApiRequest.cancel(id),
    onSuccess: (_data, id) => {
      toast.success('Đã hủy yêu cầu trả hàng');
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
      // RETURN_DETAIL nằm ở root khác returnKeys.all → phải invalidate riêng
      // để trang chi tiết đang mở refetch ngay sau khi hủy.
      queryClient.invalidateQueries({ queryKey: returnKeys.detail(id) });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
    onSettled: () => callbacks?.onSettled?.(),
  });
};
