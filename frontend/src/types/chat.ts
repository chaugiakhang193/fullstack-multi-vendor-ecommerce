export type ChatRole = 'user' | 'bot';

export type ChatMessageStatus = 'streaming' | 'done' | 'error';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  // status chỉ có ý nghĩa với tin của bot: 'streaming' là đang nhận chữ, 'error' là câu trả
  // lời hỏng giữa chừng nên tô khác màu. Tin của người dùng không bao giờ mang status.
  status?: ChatMessageStatus;
}

// Một dòng lịch sử do GET /chat/history trả về. Khác ChatMessage ở chỗ không có id (DB có id
// nhưng FE không cần) và createdAt là chuỗi RFC3339 theo UTC.
export interface ChatHistoryMessage {
  role: ChatRole;
  text: string;
  createdAt: string;
}
