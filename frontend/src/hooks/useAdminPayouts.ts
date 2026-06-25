import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import payoutsApiRequest from '@/apiRequests/payouts/payouts';
import { payoutKeys, STALE_TIME } from '@/constants/query-keys';
import { RejectPayoutBodyType } from '@/schemaValidations/payouts/payouts.schema';
import { PayoutStatus } from '@/constants/enum.generated';

const LIMIT = 10;

/** Hook Admin lấy danh sách toàn bộ các yêu cầu rút tiền trên sàn (lọc theo trạng thái nếu có) */
export const useAdminPayoutsList = (page: number, status?: PayoutStatus) => {
  return useQuery({
    queryKey: payoutKeys.adminList(page, status),
    queryFn: () => {
      const queryParams: {
        page: number;
        limit: number;
        status?: PayoutStatus;
      } = {
        page,
        limit: LIMIT,
      };
      if (status) {
        queryParams.status = status;
      }
      return payoutsApiRequest.getAdminPayouts(queryParams);
    },
    staleTime: STALE_TIME.SHORT,
    placeholderData: (prev) => prev,
  });
};

/** Hook Admin phê duyệt yêu cầu rút tiền */
export const useApprovePayout = (callbacks?: {
  onSuccess?: () => void;
  onSettled?: () => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation({
    // Lỗi nghiệp vụ 400 (vd: lệnh đã được xử lý từ trước) cần hiện toast cho admin.
    meta: { showToastOnError: true },
    mutationFn: (payoutId: string) => payoutsApiRequest.approvePayout(payoutId),
    onSuccess: (res) => {
      // Invalidate các query liên quan đến Payouts phía admin và seller
      queryClient.invalidateQueries({ queryKey: payoutKeys.all });

      const successMsg =
        res.message || 'Phê duyệt yêu cầu rút tiền thành công.';
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

/** Hook Admin từ chối yêu cầu rút tiền */
export const useRejectPayout = (callbacks?: {
  onSuccess?: () => void;
  onSettled?: () => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation({
    // Lỗi nghiệp vụ 400 (vd: lệnh đã được xử lý từ trước) cần hiện toast cho admin.
    meta: { showToastOnError: true },
    mutationFn: (variables: {
      payoutId: string;
      body: RejectPayoutBodyType;
    }) => {
      const payoutId = variables.payoutId;
      const body = variables.body;
      return payoutsApiRequest.rejectPayout(payoutId, body);
    },
    onSuccess: (res) => {
      // Invalidate các query liên quan đến Payouts phía admin và seller
      queryClient.invalidateQueries({ queryKey: payoutKeys.all });

      const successMsg = res.message || 'Từ chối yêu cầu rút tiền thành công.';
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
