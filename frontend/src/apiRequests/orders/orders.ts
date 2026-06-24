import http from '@/lib/http';
import { buildQuery } from '@/lib/utils';
import {
  CheckoutPreviewResponse,
  CheckoutBodyType,
  CheckoutPreviewBodyType,
  OrderListQueryType,
  CheckoutEnvelope,
  CheckoutPreviewEnvelope,
  CustomerOrderListEnvelope,
  CustomerOrderEnvelope,
  CancelSubOrderEnvelope,
} from '@/schemaValidations/orders/orders.schema';

const orderApiRequest = {
  // Idempotency-Key đi qua HEADER, không nằm trong body.
  checkout: (body: CheckoutBodyType, idempotencyKey: string) =>
    http.post<CheckoutEnvelope>('/orders/checkout', body, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  // POST /orders/checkout/preview — ước tính ship/freeship/coupon, không ghi DB.
  // `.parse()` để coerce mọi field tiền tệ về number (đề phòng decimal-string từ giá variant).
  checkoutPreview: (
    body: CheckoutPreviewBodyType,
    options?: { signal?: AbortSignal },
  ) =>
    http
      .post<CheckoutPreviewEnvelope>('/orders/checkout/preview', body, options)
      .then((res) => ({
        message: res.message,
        data: CheckoutPreviewResponse.parse(res.data),
      })),

  // GET /orders (Customer) — lịch sử đơn.
  getOrders: (query?: OrderListQueryType) =>
    http.get<CustomerOrderListEnvelope>(`/orders${buildQuery(query)}`),

  // GET /orders/:id (Customer)
  getOrderDetail: (id: string) =>
    http.get<CustomerOrderEnvelope>(`/orders/${id}`),

  // PATCH /orders/sub-orders/:id/cancel (Customer)
  cancelSubOrder: (subOrderId: string) =>
    http.patch<CancelSubOrderEnvelope>(
      `/orders/sub-orders/${subOrderId}/cancel`,
      {},
    ),
};

export default orderApiRequest;
