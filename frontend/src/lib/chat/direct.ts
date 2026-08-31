// Bề mặt gọi chat-service cho chat 1-1, cùng chỗ với history.ts, config.ts và stream.ts.
//
// Không đi qua lib/http.ts: file đó trỏ base URL của monolith và luôn đặt credentials: 'include'.
// CORS của chat-service không gửi Access-Control-Allow-Credentials, nên trình duyệt sẽ chặn
// response dù server đã trả 200.
import { chatFetch, readErrorBody } from '@/lib/chat/request';
import type {
  DirectConversation,
  DirectMessage,
  DirectViewer,
} from '@/types/direct-chat';

interface ConversationsResponse {
  conversations: DirectConversation[];
}

interface MessagesResponse {
  messages: DirectMessage[];
  nextBefore?: string;
}

// Đọc danh sách hội thoại.
//
// viewer quyết định nguồn: buyer lấy hội thoại mình sở hữu, seller lấy hội thoại gửi tới shop
// mình. Tham số ?as=seller KHÔNG phải cổng phân quyền — gửi nó mà không sở hữu shop nào thì
// nhận mảng rỗng, không phải hội thoại của người khác.
export async function fetchDirectConversations(
  viewer: DirectViewer,
): Promise<DirectConversation[]> {
  const query = viewer === 'seller' ? '?as=seller' : '';
  const res = await chatFetch(`/chat/conversations${query}`, { method: 'GET' });
  if (!res.ok) throw await readErrorBody(res);

  const body = (await res.json()) as ConversationsResponse;
  return Array.isArray(body?.conversations) ? body.conversations : [];
}

// Đọc một trang tin nhắn, MỚI NHẤT TRƯỚC.
//
// Trả nguyên thứ tự server gửi về, không đảo ở đây: nơi vẽ mới biết nó cần chiều nào, và đảo
// hai lần là một lần thừa.
export async function fetchDirectMessages(
  conversationId: string,
  before?: string,
): Promise<MessagesResponse> {
  const params = new URLSearchParams({ conversationId });
  if (before) params.set('before', before);

  const res = await chatFetch(`/chat/messages?${params.toString()}`, {
    method: 'GET',
  });
  if (!res.ok) throw await readErrorBody(res);

  const body = (await res.json()) as MessagesResponse;
  return {
    messages: Array.isArray(body?.messages) ? body.messages : [],
    nextBefore: body?.nextBefore,
  };
}

// Đánh dấu đã đọc tới thời điểm hiện tại.
//
// Không gửi mốc thời gian: server tự lấy giờ của nó. Gửi lên được một mốc tương lai là tự xoá
// vĩnh viễn số chưa đọc của chính mình.
//
// Nuốt lỗi có chủ ý: đây là thao tác nền, hỏng thì badge hiện sai một lúc rồi tự đúng ở lần mở
// sau. Ném lỗi ra đây sẽ làm hỏng cả thao tác mở hội thoại — thứ người dùng thật sự vừa bấm.
export async function markDirectRead(conversationId: string): Promise<boolean> {
  try {
    const res = await chatFetch('/chat/read', {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
