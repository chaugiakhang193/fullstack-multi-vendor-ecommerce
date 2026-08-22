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
