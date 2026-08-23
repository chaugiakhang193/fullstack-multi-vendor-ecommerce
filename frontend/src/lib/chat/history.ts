import { chatFetch } from '@/lib/chat/request';
import type { ChatHistoryMessage } from '@/types/chat';

function isHistoryMessage(value: unknown): value is ChatHistoryMessage {
  const message = value as ChatHistoryMessage | null;
  return (
    typeof message?.text === 'string' &&
    (message.role === 'user' || message.role === 'bot')
  );
}

// Nạp lịch sử hội thoại bot của chính người đang gọi.
//
// Đi qua chatFetch để mang theo Authorization hoặc X-Guest-Key: BE dựa vào đúng hai thứ đó để
// biết hội thoại nào là của ai.
//
// Mọi đường hỏng đều trả mảng rỗng chứ không ném: lịch sử là thứ có thì tốt. Ném lỗi ở đây nghĩa
// là panel mở lên hiện một câu báo đỏ trong khi người dùng vẫn hỏi bot được bình thường.
export async function fetchHistory(): Promise<ChatHistoryMessage[]> {
  try {
    const res = await chatFetch('/chat/history', { method: 'GET' });
    if (!res.ok) return [];

    const body = await res.json();
    if (!Array.isArray(body?.messages)) return [];

    return body.messages
      .filter(isHistoryMessage)
      .map((message: ChatHistoryMessage) => ({
        role: message.role,
        text: message.text,
        createdAt: String(message.createdAt ?? ''),
      }));
  } catch {
    return [];
  }
}
