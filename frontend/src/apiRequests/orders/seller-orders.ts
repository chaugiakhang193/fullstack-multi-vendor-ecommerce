import http from "@/lib/http";
import { buildQuery } from "@/lib/utils";
import {
  SellerOrderList,
  SellerOrder,
  OrderListQueryType,
  UpdateOrderStatusBodyType,
  SellerOrderListEnvelope,
  SellerOrderEnvelope,
  UpdateOrderStatusEnvelope,
} from "@/schemaValidations/orders/orders.schema";

// Seller orders trả thẳng entity SubOrder thô → cột `decimal` của TypeORM về dạng
// STRING. `.parse()` để z.coerce.number() ép về number thật (nếu không, phép cộng
// sub_total + shipping_fee sẽ là nối chuỗi → NaN khi format).
const sellerOrderApiRequest = {
  // GET /seller/orders (Seller) — phân trang { items, meta }.
  getSellerOrders: (query?: OrderListQueryType) =>
    http
      .get<SellerOrderListEnvelope>(`/seller/orders${buildQuery(query)}`)
      .then((res) => ({ message: res.message, data: SellerOrderList.parse(res.data) })),

  // GET /seller/orders/:id (Seller)
  getSellerOrderDetail: (id: string) =>
    http
      .get<SellerOrderEnvelope>(`/seller/orders/${id}`)
      .then((res) => ({ message: res.message, data: SellerOrder.parse(res.data) })),

  // PATCH /seller/orders/:id/status (Seller) — state machine.
  updateSellerOrderStatus: (id: string, body: UpdateOrderStatusBodyType) =>
    http.patch<UpdateOrderStatusEnvelope>(`/seller/orders/${id}/status`, body),
};

export default sellerOrderApiRequest;
