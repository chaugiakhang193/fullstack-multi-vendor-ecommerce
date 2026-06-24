import { BadRequestException } from '@nestjs/common';
import { PayoutStatus } from '@/common/enums';

/**
 * State Machine cho Payouts (đồng bộ với frontend PAYOUT_STATE_MACHINE).
 * Khai báo các trạng thái đích hợp lệ từ mỗi trạng thái hiện tại.
 */
export const PAYOUT_STATE_MACHINE: Record<PayoutStatus, PayoutStatus[]> = {
  [PayoutStatus.PENDING]: [PayoutStatus.COMPLETED, PayoutStatus.REJECTED],
  [PayoutStatus.PROCESSING]: [PayoutStatus.COMPLETED, PayoutStatus.REJECTED],
  [PayoutStatus.COMPLETED]: [],
  [PayoutStatus.REJECTED]: [],
  [PayoutStatus.FAILED]: [],
};

/** Kiểm tra một chuyển trạng thái payout có hợp lệ hay không. */
export function canTransitionPayout(
  from: PayoutStatus,
  to: PayoutStatus,
): boolean {
  const allowed = PAYOUT_STATE_MACHINE[from] || [];
  return allowed.includes(to);
}

/**
 * Đảm bảo chuyển trạng thái hợp lệ, nếu không ném BadRequestException.
 * Dùng chung cho approve/reject để tránh logic kiểm tra rải rác.
 */
export function assertPayoutTransition(
  from: PayoutStatus,
  to: PayoutStatus,
): void {
  if (!canTransitionPayout(from, to)) {
    const errorMsg = 'Yêu cầu rút tiền đã được xử lý từ trước.';
    throw new BadRequestException(errorMsg);
  }
}
