// Tên queue dùng chung giữa producer (PaymentsService đẩy job) và consumer
// (VnpayExpiryProcessor). Đặt ở file riêng để hai module import cùng một hằng,
// tránh gõ lệch chuỗi rồi job rơi vào queue không ai đọc.
export const VNPAY_EXPIRY_QUEUE = 'vnpay-expiry';

// Cửa sổ MỀM: tính từ lần thử thanh toán mới nhất. Khách bấm "Thử lại" thì mốc
// này trượt theo, đúng với việc VNPay cấp URL mới hạn 15 phút.
export const VNPAY_SOFT_WINDOW_MS = 15 * 60 * 1000;

// Cửa sổ CỨNG: tính từ lúc tạo đơn, KHÔNG bao giờ nới. Không có mốc này thì kẻ
// xấu cứ 14 phút bấm thử lại một lần là giữ kho vô thời hạn.
export const VNPAY_HARD_WINDOW_MS = 30 * 60 * 1000;

// Còn ít hơn ngần này tới trần cứng thì từ chối tạo URL: đưa khách một URL sống
// vài chục giây rồi hủy đơn giữa chừng còn tệ hơn là báo thẳng "đặt đơn mới".
export const VNPAY_MIN_PAYABLE_MS = 3 * 60 * 1000;
