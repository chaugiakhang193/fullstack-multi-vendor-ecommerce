import { getGuestKey } from '@/lib/chat/guest-key';
import { useAuthStore } from '@/store/useAuthStore';

export const CHAT_SERVICE_URL = process.env.NEXT_PUBLIC_CHAT_SERVICE_URL ?? '';

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

// Đã đăng nhập thì gửi Authorization, còn lại gửi X-Guest-Key. Không gửi cả hai: BE bỏ qua guest
// key khi đã có token, gửi kèm chỉ làm request dài ra vô ích.
//
// Content-Type chỉ đặt khi có body. Một request GET mang Content-Type là thừa, và với CORS thì
// mỗi header thừa là một dòng nữa phải khớp với Access-Control-Allow-Headers.
function buildHeaders(
  token: string | null,
  hasBody: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hasBody) headers['Content-Type'] = 'application/json';

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  const guestKey = getGuestKey();
  if (guestKey) headers['X-Guest-Key'] = guestKey;
  return headers;
}

interface ChatRequestInit {
  method: string;
  body?: string;
  signal?: AbortSignal;
}

async function send(
  path: string,
  init: ChatRequestInit,
  token: string | null,
): Promise<Response> {
  try {
    return await fetch(`${CHAT_SERVICE_URL}${path}`, {
      method: init.method,
      headers: buildHeaders(token, init.body !== undefined),
      body: init.body,
      signal: init.signal,
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

// Gọi chat-service kèm danh tính, tự làm mới token một lần khi gặp 401.
//
// silentRefresh đã tự gộp các lần gọi trùng và tự logout khi thất bại, nên gọi thẳng nó thay vì
// viết vòng refresh thứ ba trong dự án. Hai luồng refresh chạy song song không làm văng session:
// BE có ân hạn 10 giây cho token đời trước.
export async function chatFetch(
  path: string,
  init: ChatRequestInit,
): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  const res = await send(path, init, token);
  if (res.status !== 401) return res;

  const refreshed = await useAuthStore.getState().silentRefresh();

  // Refresh hỏng thì gọi lại với tư cách khách còn hơn nuốt mất thao tác người dùng vừa làm.
  // silentRefresh đã logout nên accessToken lúc này là null, buildHeaders tự chuyển sang
  // X-Guest-Key.
  const retryToken = refreshed ? useAuthStore.getState().accessToken : null;
  return send(path, init, retryToken);
}

// Đọc lý do từ BODY chứ không phải header Retry-After: chat-service có set header đó nhưng không
// khai Access-Control-Expose-Headers, nên JS đọc ra null.
export async function readErrorBody(res: Response): Promise<ChatRequestError> {
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
