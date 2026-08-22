import { CHAT_EVENTS } from '@/constants/chat';
import { getGuestKey } from '@/lib/chat/guest-key';
import { useAuthStore } from '@/store/useAuthStore';

const CHAT_SERVICE_URL = process.env.NEXT_PUBLIC_CHAT_SERVICE_URL ?? '';

export type ChatStreamEvent =
  | { type: 'meta'; remaining?: number; cached?: boolean }
  | { type: 'tool'; name: string }
  | { type: 'text'; v: string }
  | { type: 'done'; cached: boolean; truncated: boolean }
  | { type: 'error'; reason: string };

// Lỗi xảy ra TRƯỚC khi stream mở — lúc còn đọc được HTTP status.
export class ChatRequestError extends Error {
  status: number;
  reason: string;
  retryAfter: number;

  constructor(status: number, reason: string, retryAfter: number) {
    super(`chat request failed: ${status} ${reason}`);
    this.name = 'ChatRequestError';
    this.status = status;
    this.reason = reason;
    this.retryAfter = retryAfter;
  }
}

// Lỗi khi fetch ném trước cả khi có response: mất mạng, service đang ngủ đông, hoặc CORS chặn.
//
// CORS 403 KHÔNG đến FE dưới dạng status 403 — trình duyệt nuốt response và ném TypeError.
// Nên đừng đi tìm số 403 ở đâu trong file này.
export class ChatNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatNetworkError';
  }
}

// Đã đăng nhập thì gửi Authorization, còn lại gửi X-Guest-Key. Không gửi cả hai: BE bỏ qua
// guest key khi đã có token, gửi kèm chỉ làm request dài ra vô ích.
function buildHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  const guestKey = getGuestKey();
  if (guestKey) headers['X-Guest-Key'] = guestKey;
  return headers;
}

async function postQuestion(
  question: string,
  token: string | null,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await fetch(`${CHAT_SERVICE_URL}/chat/bot`, {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({ question }),
      signal,
      // TUYỆT ĐỐI KHÔNG đặt credentials: 'include' ở đây, dù lib/http.ts luôn đặt.
      // CORS của chat-service không gửi Access-Control-Allow-Credentials, nên bật credentials
      // là trình duyệt chặn sạch response — kể cả khi server đã trả 200 và đã stream xong.
    });
  } catch (error) {
    // Người dùng rời trang / đóng widget: để nguyên AbortError cho tầng trên phân biệt.
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error;
    throw new ChatNetworkError('không gọi được chat-service');
  }
}

// Đọc lý do từ BODY chứ không phải header Retry-After: chat-service có set header đó nhưng
// không khai Access-Control-Expose-Headers, nên JS đọc ra null.
async function readErrorBody(res: Response): Promise<ChatRequestError> {
  let reason = 'upstream';
  let retryAfter = 0;

  try {
    const body = await res.json();
    if (typeof body?.reason === 'string') reason = body.reason;
    if (typeof body?.retryAfter === 'number') retryAfter = body.retryAfter;
  } catch {
    // Body không phải JSON. Giữ nguyên reason mặc định.
  }

  return new ChatRequestError(res.status, reason, retryAfter);
}

// Dịch một khối SSE thành event có kiểu, hoặc null nếu khối đó không phải event (keepalive,
// khối rỗng, JSON hỏng).
function parseBlock(block: string): ChatStreamEvent | null {
  let name = '';
  let data = '';

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trimEnd();
    // Dòng bắt đầu bằng ":" là comment theo chuẩn SSE — chat-service gửi ": keepalive" mỗi
    // 20 giây để Cloudflare trước Render không cắt kết nối đang im lặng.
    if (line === '' || line.startsWith(':')) continue;
    if (line.startsWith('event:')) name = line.slice('event:'.length).trim();
    else if (line.startsWith('data:')) data = line.slice('data:'.length).trim();
  }

  if (!name || !data) return null;

  let payload: any;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }

  switch (name) {
    case CHAT_EVENTS.META:
      return {
        type: 'meta',
        remaining: payload.remaining,
        cached: payload.cached,
      };
    case CHAT_EVENTS.TOOL:
      return { type: 'tool', name: String(payload.name ?? '') };
    case CHAT_EVENTS.TEXT:
      return { type: 'text', v: String(payload.v ?? '') };
    case CHAT_EVENTS.DONE:
      return {
        type: 'done',
        cached: Boolean(payload.cached),
        truncated: Boolean(payload.truncated),
      };
    case CHAT_EVENTS.ERROR:
      return { type: 'error', reason: String(payload.reason ?? 'upstream') };
    default:
      return null;
  }
}

async function readStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    // stream: true để một ký tự tiếng Việt bị cắt đôi giữa hai chunk vẫn ghép lại đúng chữ
    // thay vì thành dấu hỏi ngược.
    buffer += decoder.decode(value, { stream: true });

    // Một event kết thúc bằng dòng trống. Cắt theo "\n\n" chứ không theo từng dòng: chunk từ
    // mạng về không trùng ranh giới event, một chunk có thể chứa hai event rưỡi.
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const event = parseBlock(block);
      if (event) onEvent(event);

      boundary = buffer.indexOf('\n\n');
    }
  }
}

// Hỏi bot và bơm từng event ra qua onEvent.
//
// Lỗi đi ra bằng HAI đường khác nhau và caller phải xử cả hai:
//   - ném ChatRequestError / ChatNetworkError: hỏng TRƯỚC khi stream mở
//   - onEvent({ type: 'error' }): hỏng GIỮA stream, khi status 200 đã gửi đi mất rồi
export async function askBot(
  question: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  let res = await postQuestion(question, token, signal);

  if (res.status === 401) {
    // silentRefresh đã tự gộp các lần gọi trùng và tự logout khi thất bại, nên gọi thẳng nó
    // thay vì viết vòng refresh thứ ba trong dự án. Hai luồng refresh chạy song song không
    // làm văng session: BE có ân hạn 10 giây cho token đời trước.
    const refreshed = await useAuthStore.getState().silentRefresh();

    // Refresh hỏng thì hỏi tiếp với tư cách khách còn hơn nuốt mất câu hỏi người dùng vừa gõ.
    // silentRefresh đã logout nên accessToken lúc này là null, buildHeaders tự chuyển sang
    // X-Guest-Key.
    const retryToken = refreshed ? useAuthStore.getState().accessToken : null;
    res = await postQuestion(question, retryToken, signal);
  }

  if (!res.ok) throw await readErrorBody(res);
  if (!res.body)
    throw new ChatRequestError(res.status, 'stream_unavailable', 0);

  await readStream(res.body, onEvent);
}
