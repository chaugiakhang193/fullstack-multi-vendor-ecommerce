export type ChatRole = 'user' | 'bot';

export type ChatMessageStatus = 'streaming' | 'done' | 'error';

// Tin nhắn chữ: câu người dùng gõ, hoặc câu bot trả lời.
//
// status chỉ có ý nghĩa với tin của bot: 'streaming' là đang nhận chữ, 'error' là câu trả lời
// hỏng giữa chừng nên tô khác màu. Tin của người dùng không bao giờ mang status.
export interface ChatTextMessage {
  kind: 'text';
  id: string;
  role: ChatRole;
  text: string;
  status?: ChatMessageStatus;
  // Mốc thời gian tính bằng mili giây. Cần để trộn tin từ hai nguồn — lịch sử lấy từ DB và các
  // khối sinh ngay tại trình duyệt — về đúng thứ tự thời gian.
  at: number;
}

// Kết quả của phím tắt danh mục: một khối sản phẩm chứ không phải một câu chữ.
//
// Giữ categoryId chứ không giữ danh sách sản phẩm, vì giá và tồn kho phải lấy tươi mỗi lần vẽ.
// Cất sẵn kết quả nghĩa là mở lại hội thoại hôm sau vẫn thấy giá hôm qua, ngay bên dưới dòng
// "Giá và tình trạng hàng lấy theo trang sản phẩm" ở chân panel.
export interface ChatProductsMessage {
  kind: 'products';
  id: string;
  categoryId: string;
  categoryName: string;
  at: number;
}

export type ChatMessage = ChatTextMessage | ChatProductsMessage;

// Một dòng lịch sử do GET /chat/history trả về. Khác ChatMessage ở chỗ không có id (DB có id
// nhưng FE không cần) và createdAt là chuỗi RFC3339 theo UTC.
export interface ChatHistoryMessage {
  role: ChatRole;
  text: string;
  createdAt: string;
}
