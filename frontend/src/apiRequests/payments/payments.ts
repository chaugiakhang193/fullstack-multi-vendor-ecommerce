import http from '@/lib/http';
import {
  CreateVnpayUrlBodyType,
  CreateVnpayUrlEnvelope,
  VnpayReturnEnvelope,
} from '@/schemaValidations/payments/payments.schema';

const paymentApiRequest = {
  // POST /payments/vnpay/create-url (Bearer token tự đính kèm qua lib/http).
  createVnpayUrl: (body: CreateVnpayUrlBodyType) =>
    http.post<CreateVnpayUrlEnvelope>('/payments/vnpay/create-url', body),

  // GET /payments/vnpay/return — forward NGUYÊN query VNPay (window.location.search,
  // đã có sẵn '?') để BE verify chữ ký. KHÔNG parse lại để không đổi encode.
  getVnpayReturn: (search: string) =>
    http.get<VnpayReturnEnvelope>(`/payments/vnpay/return${search}`),
};

export default paymentApiRequest;
