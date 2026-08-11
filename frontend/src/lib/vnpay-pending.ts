// Cầu nối orderId qua vòng redirect VNPay. VNPay return chỉ có vnp_TxnRef, KHÔNG có
// orderId (UUID) mà GET /orders/:id cần → giữ ở sessionStorage của CHÍNH tab.
// sessionStorage sống xuyên full reload + round-trip cross-origin trong cùng tab,
// chỉ mất khi ĐÓNG tab (khi đó trang Return dùng fallback). Tách theo tab nên nhiều
// tab checkout song song KHÔNG lẫn nhau (lý do chọn sessionStorage, không phải localStorage).
const KEY = 'vnpay_pending_order';

export interface PendingPayment {
  orderId: string;
  orderNumber: string;
}

export function setPendingPayment(p: PendingPayment): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage bị chặn (private mode ngặt) → bỏ qua, trang Return sẽ fallback.
  }
}

export function readPendingPayment(): PendingPayment | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingPayment>;
    if (!parsed.orderId || !parsed.orderNumber) return null;
    return { orderId: parsed.orderId, orderNumber: parsed.orderNumber };
  } catch {
    return null;
  }
}

export function clearPendingPayment(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
