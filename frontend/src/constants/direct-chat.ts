// Giới hạn dài của một tin nhắn, khớp CHECK (char_length(body) <= 4000) của bảng message.
// Lệch nhau thì người dùng gõ xong mới bị từ chối ở tận tầng DB.
export const MAX_DIRECT_MESSAGE_LENGTH = 4000;

// Số hội thoại và số tin mỗi trang. Chỉ để FE biết khi nào còn trang sau — server tự đặt giới
// hạn của nó (30) và không nhận limit từ client.
export const DIRECT_PAGE_SIZE = 30;

// Mã đóng riêng cho "danh tính không dùng được nữa", do chat-service định nghĩa.
// 4401 chứ không phải 1008: nằm trong vùng mã dành cho ứng dụng, và client cần phân biệt
// "đi làm mới token rồi nối lại" với mọi lý do đóng khác.
export const WS_CLOSE_UNAUTHORIZED = 4401;

// Backoff nối lại. Nhân đôi sau mỗi lần hỏng, chặn trên 30 giây.
//
// Trần cao là cố ý: chat-service ngủ đông trên gói free và mất 30–50 giây để dậy. Nối lại mỗi
// giây trong quãng đó chỉ nện request vào một service đang khởi động, không làm nó nhanh hơn.
export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 30000;

// Nhiễu ngẫu nhiên cộng vào mỗi lần chờ, để nhiều tab của cùng một người không nối lại đúng
// cùng một khoảnh khắc.
export const RECONNECT_JITTER_MS = 400;

export const DIRECT_ERROR_MESSAGES: Record<string, string> = {
  bad_text: 'Tin nhắn trống hoặc quá dài.',
  too_fast: 'Bạn gửi hơi nhanh, chờ một chút nhé.',
  conversation_not_found: 'Không mở được hội thoại này.',
  own_shop: 'Đây là shop của bạn, không thể tự nhắn cho mình.',
  missing_target: 'Chưa biết gửi tin này cho shop nào.',
  store_unavailable: 'Máy chủ chat đang bận, thử lại sau nhé.',
  send_failed: 'Gửi không thành công. Bạn thử lại nhé.',
  unsupported_type: 'Phiên bản trang đang cũ, tải lại giúp mình nhé.',
};

export const DIRECT_FALLBACK_ERROR = 'Gửi không thành công. Bạn thử lại nhé.';

// Câu hiển thị theo trạng thái kết nối. 'ready' không có câu nào: đường realtime chạy tốt là
// trạng thái bình thường, không đáng chiếm một dòng trên màn hình.
export const DIRECT_STATUS_MESSAGES: Record<string, string> = {
  connecting: 'Đang kết nối…',
  reconnecting: 'Mất kết nối, đang thử lại…',
  unauthorized: 'Phiên đăng nhập đã hết hạn. Bạn đăng nhập lại nhé.',
};
