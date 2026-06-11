import http from "@/lib/http";
import {
  CheckoutBodyType,
  CheckoutPreviewBodyType,
  OrderListQueryType,
  UpdateOrderStatusBodyType,
  OrderEnvelope,
} from "@/schemaValidations/orders/orders.schema";

const toQuery = (q?: OrderListQueryType) => {
  if (!q) return "";
  const params = new URLSearchParams();
  if (q.page) params.set("page", String(q.page));
  if (q.limit) params.set("limit", String(q.limit));
  if (q.status) params.set("status", q.status);
  const s = params.toString();
  return s ? `?${s}` : "";
};

const orderApiRequest = {
  // ===== ĐÃ CÓ backend =====
  // Idempotency-Key đi qua HEADER, không nằm trong body.
  checkout: (body: CheckoutBodyType, idempotencyKey: string) =>
    http.post<OrderEnvelope>("/orders/checkout", body, {
      headers: { "Idempotency-Key": idempotencyKey },
    }),

  // ===== @TODO W2: backend chưa tồn tại, sẽ nối ở Tuần 2 =====
  // @TODO W2: POST /orders/checkout/preview
  checkoutPreview: (body: CheckoutPreviewBodyType) =>
    http.post<OrderEnvelope>("/orders/checkout/preview", body),

  // @TODO W2: GET /orders (Customer)
  getOrders: (query?: OrderListQueryType) =>
    http.get<OrderEnvelope>(`/orders${toQuery(query)}`),

  // @TODO W2: GET /orders/:id (Customer)
  getOrderDetail: (id: string) =>
    http.get<OrderEnvelope>(`/orders/${id}`),

  // @TODO W2: PATCH /orders/sub-orders/:id/cancel (Customer)
  cancelSubOrder: (subOrderId: string) =>
    http.patch<OrderEnvelope>(`/orders/sub-orders/${subOrderId}/cancel`, {}),

  // @TODO W2: GET /seller/orders (Seller)
  getSellerOrders: (query?: OrderListQueryType) =>
    http.get<OrderEnvelope>(`/seller/orders${toQuery(query)}`),

  // @TODO W2: GET /seller/orders/:id (Seller)
  getSellerOrderDetail: (id: string) =>
    http.get<OrderEnvelope>(`/seller/orders/${id}`),

  // @TODO W2: PATCH /seller/orders/:id/status (Seller)
  updateSellerOrderStatus: (id: string, body: UpdateOrderStatusBodyType) =>
    http.patch<OrderEnvelope>(`/seller/orders/${id}/status`, body),
};

export default orderApiRequest;
