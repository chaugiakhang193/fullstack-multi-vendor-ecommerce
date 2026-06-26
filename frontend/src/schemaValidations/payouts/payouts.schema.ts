import z from 'zod';
import { paginated } from '../common.schema';
import { PAYOUT_LIMITS } from '@/constants/limits.generated';
import { PayoutStatus } from '@/constants/enum.generated';
import type { components } from '@/lib/api/api-schema';
import type { ApiEnvelope } from '@/lib/http';

type CreatePayoutDto = components['schemas']['CreatePayoutDto'];
type RejectPayoutDto = components['schemas']['RejectPayoutDto'];

// Định nghĩa các biến thông báo lỗi và giá trị giới hạn để tuân thủ quy tắc No Inline Arguments
const minAmount = PAYOUT_LIMITS.MIN_AMOUNT;
const localeString = 'vi-VN';
const formattedMinAmount = minAmount.toLocaleString(localeString);
const amountMinErrorMsg = `Số tiền rút tối thiểu là ${formattedMinAmount}đ.`;
const amountInvalidTypeErrorMsg = 'Số tiền rút phải là số.';

const reasonMinErrorMsg = 'Lý do từ chối không được để trống.';
const reasonInvalidTypeErrorMsg = 'Lý do từ chối phải là chuỗi.';

export const CreatePayoutBody = z
  .object({
    amount: z
      .number({ invalid_type_error: amountInvalidTypeErrorMsg })
      .min(minAmount, amountMinErrorMsg),
  })
  .strict() satisfies z.ZodType<CreatePayoutDto, any, any>;

export const RejectPayoutBody = z
  .object({
    reason: z
      .string({ invalid_type_error: reasonInvalidTypeErrorMsg })
      .trim()
      .min(1, reasonMinErrorMsg),
  })
  .strict() satisfies z.ZodType<RejectPayoutDto, any, any>;

export const BalanceSchema = z.object({
  gross_revenue: z.coerce.number(),
  commission_amount: z.coerce.number(),
  total_revenue: z.coerce.number(),
  total_payouted: z.coerce.number(),
  available_balance: z.coerce.number(),
  pending_payout: z.coerce.number(),
});

export const BankSnapshotSchema = z.object({
  bank_name: z.string().optional().nullable(),
  account_number: z.string().optional().nullable(),
  account_holder: z.string().optional().nullable(),
});

export const PayoutItemSchema = z.object({
  id: z.string().uuid(),
  amount: z.coerce.number(),
  commission_fee: z.coerce.number(),
  status: z.nativeEnum(PayoutStatus),
  reject_reason: z.string().nullable(),
  bank_info_snapshot: BankSnapshotSchema,
  resolved_at: z.string().nullable(),
  created_at: z.string(),
});

export const AdminPayoutItemSchema = PayoutItemSchema.extend({
  shop: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
    })
    .nullable(),
});

export const PayoutListSchema = paginated(PayoutItemSchema);

export const AdminPayoutListSchema = paginated(AdminPayoutItemSchema);

// State Machine cho Payouts (Quy trình duyệt rút tiền của Admin)
export const PAYOUT_STATE_MACHINE: Record<PayoutStatus, PayoutStatus[]> = {
  [PayoutStatus.PENDING]: [PayoutStatus.COMPLETED, PayoutStatus.REJECTED],
  [PayoutStatus.PROCESSING]: [PayoutStatus.COMPLETED, PayoutStatus.REJECTED],
  [PayoutStatus.COMPLETED]: [],
  [PayoutStatus.REJECTED]: [],
  [PayoutStatus.FAILED]: [],
};

// Export các Type trích xuất ở dưới cùng của file
export type CreatePayoutBodyType = z.TypeOf<typeof CreatePayoutBody>;
export type RejectPayoutBodyType = z.TypeOf<typeof RejectPayoutBody>;
export type BalanceType = z.TypeOf<typeof BalanceSchema>;
export type PayoutItemType = z.TypeOf<typeof PayoutItemSchema>;
export type AdminPayoutItemType = z.TypeOf<typeof AdminPayoutItemSchema>;
export type PayoutListType = z.TypeOf<typeof PayoutListSchema>;
export type AdminPayoutListType = z.TypeOf<typeof AdminPayoutListSchema>;

export type BalanceEnvelopeType = ApiEnvelope<BalanceType>;
export type PayoutListEnvelopeType = ApiEnvelope<PayoutListType>;
export type AdminPayoutListEnvelopeType = ApiEnvelope<AdminPayoutListType>;

export type PayoutResponseDto = components['schemas']['PayoutResponseDto'];
export type PayoutResponseEnvelope = ApiEnvelope<PayoutResponseDto>;
