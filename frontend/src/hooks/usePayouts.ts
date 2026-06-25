import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import payoutsApiRequest from '@/apiRequests/payouts/payouts';
import { payoutKeys, STALE_TIME } from '@/constants/query-keys';
import { CreatePayoutBodyType } from '@/schemaValidations/payouts/payouts.schema';

const LIMIT = 10;

/** Hook lấy số dư khả dụng và thống kê rút tiền của Shop */
export const useSellerBalance = () => {
  return useQuery({
    queryKey: payoutKeys.balance,
    queryFn: () => payoutsApiRequest.getSellerBalance(),
    staleTime: STALE_TIME.SHORT,
  });
};

/** Hook lấy lịch sử yêu cầu rút tiền của Shop kèm phân trang */
export const useSellerPayoutHistory = (page: number) => {
  return useQuery({
    queryKey: payoutKeys.history(page),
    queryFn: () => {
      const queryParams = {
        page,
        limit: LIMIT,
      };
      return payoutsApiRequest.getSellerPayoutHistory(queryParams);
    },
    staleTime: STALE_TIME.SHORT,
    placeholderData: (prev) => prev,
  });
};

/** Hook Seller gửi yêu cầu rút tiền mới */
export const useRequestPayout = (callbacks?: {
  onSuccess?: () => void;
  onSettled?: () => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation({
    // Nút bấm/form không hiển thị lỗi nghiệp vụ inline → ép toast cho lỗi 400
    // (số dư không đủ, đang có lệnh chờ, chưa cấu hình ngân hàng...) qua mutationCache global.
    meta: { showToastOnError: true },
    mutationFn: (body: CreatePayoutBodyType) =>
      payoutsApiRequest.requestPayout(body),
    onSuccess: (res) => {
      // Invalidate các query key của Payouts để UI cập nhật số dư & lịch sử mới
      queryClient.invalidateQueries({ queryKey: payoutKeys.all });

      const successMsg =
        res.message || 'Yêu cầu rút tiền đã được gửi thành công.';
      toast.success(successMsg);

      if (callbacks?.onSuccess) {
        callbacks.onSuccess();
      }
    },
    onSettled: () => {
      if (callbacks?.onSettled) {
        callbacks.onSettled();
      }
    },
  });
};
