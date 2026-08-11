import z from 'zod';
import type { components } from '@/lib/api/api-schema';
import type { ApiEnvelope } from '@/lib/http';

type CreateVnpayUrlDto = components['schemas']['CreateVnpayUrlDto'];

// Enum thanh toán — mirror backend common/enums.ts (đồng bộ qua enum.generated.ts).
// Đặt ở đây làm nguồn dùng chung cho orders.schema (field `payment` trên đơn).
export const PaymentMethodEnum = z.enum(['cod', 'vnpay']);
export const PaymentStatusEnum = z.enum([
  'pending',
  'completed',
  'failed',
  'refunded',
]);

// ===== Body: POST /payments/vnpay/create-url =====
export const CreateVnpayUrlBody = z.object({
  orderId: z.string().uuid(),
}) satisfies z.ZodType<CreateVnpayUrlDto, any, any>;

// ===== Response create-url (viết tay — BE không khai @ApiResponse; status 201) =====
export const CreateVnpayUrlResponse = z.object({
  paymentUrl: z.string().url(),
});

// ===== Response GET /payments/vnpay/return (viết tay — Public, chỉ hiển thị) =====
// BE verify chữ ký rồi trả { code, message, txnRef }. code '00' = thành công.
export const VnpayReturnResponse = z.object({
  code: z.string(),
  message: z.string(),
  txnRef: z.string().nullable(),
});

// ===== Types =====
export type PaymentMethodType = z.TypeOf<typeof PaymentMethodEnum>;
export type PaymentStatusType = z.TypeOf<typeof PaymentStatusEnum>;
export type CreateVnpayUrlBodyType = z.TypeOf<typeof CreateVnpayUrlBody>;
export type CreateVnpayUrlResponseType = z.TypeOf<
  typeof CreateVnpayUrlResponse
>;
export type VnpayReturnResponseType = z.TypeOf<typeof VnpayReturnResponse>;

export type CreateVnpayUrlEnvelope = ApiEnvelope<CreateVnpayUrlResponseType>;
export type VnpayReturnEnvelope = ApiEnvelope<VnpayReturnResponseType>;
