import http from '@/lib/http';
import { buildQuery } from '@/lib/utils';
import { PayoutStatus } from '@/constants/enum.generated';
import {
  BalanceSchema,
  PayoutListSchema,
  AdminPayoutListSchema,
  BalanceEnvelopeType,
  PayoutListEnvelopeType,
  AdminPayoutListEnvelopeType,
  CreatePayoutBodyType,
  RejectPayoutBodyType,
  PayoutResponseEnvelope,
} from '@/schemaValidations/payouts/payouts.schema';

type PayoutHistoryQuery = { page?: number; limit?: number };
type AdminPayoutQuery = {
  page?: number;
  limit?: number;
  status?: PayoutStatus;
};

// Balance & list trả entity thô (cột decimal của TypeORM về dạng STRING) → .parse()
// để z.coerce.number() ép về number thật, tránh nối chuỗi/NaN khi tính toán & format.
const payoutsApiRequest = {
  getSellerBalance: () =>
    http.get<BalanceEnvelopeType>('/seller/payouts/balance').then((res) => ({
      message: res.message,
      data: BalanceSchema.parse(res.data),
    })),

  requestPayout: (body: CreatePayoutBodyType) =>
    http.post<PayoutResponseEnvelope>('/seller/payouts', body),

  getSellerPayoutHistory: (query?: PayoutHistoryQuery) =>
    http
      .get<PayoutListEnvelopeType>(
        `/seller/payouts/history${buildQuery(query)}`,
      )
      .then((res) => ({
        message: res.message,
        data: PayoutListSchema.parse(res.data),
      })),

  getAdminPayouts: (query?: AdminPayoutQuery) =>
    http
      .get<AdminPayoutListEnvelopeType>(`/admin/payouts${buildQuery(query)}`)
      .then((res) => ({
        message: res.message,
        data: AdminPayoutListSchema.parse(res.data),
      })),

  approvePayout: (payoutId: string) =>
    http.patch<PayoutResponseEnvelope>(
      `/admin/payouts/${payoutId}/approve`,
      {},
    ),

  rejectPayout: (payoutId: string, body: RejectPayoutBodyType) =>
    http.patch<PayoutResponseEnvelope>(
      `/admin/payouts/${payoutId}/reject`,
      body,
    ),
};

export default payoutsApiRequest;
