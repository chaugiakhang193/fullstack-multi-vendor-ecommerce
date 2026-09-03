import { BOT_CONNECT_TIMEOUT_MS, CHAT_EVENTS } from '@/constants/chat';
import {
  chatFetch,
  ChatNetworkError,
  ChatRequestError,
  readErrorBody,
} from '@/lib/chat/request';

export type ChatStreamEvent =
  | { type: 'meta'; remaining?: number; cached?: boolean }
  | { type: 'tool'; name: string }
  | { type: 'text'; v: string }
  | { type: 'done'; cached: boolean; truncated: boolean }
  | { type: 'error'; reason: string };

// Hai lớp lỗi nằm ở lib/chat/request.ts vì GET /chat/history cũng ném đúng chúng. Re-export để
// những chỗ đang import từ file này không phải sửa theo.
export { ChatNetworkError, ChatRequestError } from '@/lib/chat/request';

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
  // Trần chỉ bọc quãng chờ header, và được gỡ ngay khi header về. Bọc cả stream thì một câu trả
  // lời đến sau cold start bị cắt oan: cold start và thời gian bot trả lời là hai quãng nối tiếp
  // nhau, cộng lại vượt bất kỳ con số nào đủ nhỏ để có ích. Khi stream đã chảy thì các trần phía
  // chat-service đã chặn rồi, FE không cần chặn thêm.
  const connectTimeout = new AbortController();
  const timeoutId = setTimeout(
    () => connectTimeout.abort(),
    BOT_CONNECT_TIMEOUT_MS,
  );

  let res: Response;
  try {
    res = await chatFetch('/chat/bot', {
      method: 'POST',
      body: JSON.stringify({ question }),
      signal: AbortSignal.any([signal, connectTimeout.signal]),
    });
  } catch (error) {
    // Chỉ đổi lỗi khi chính trần này bắn. Widget bị gỡ giữa chừng cũng abort, nhưng đó không phải
    // lỗi và tầng trên nhận ra nó bằng cách đọc signal của chính nó.
    if (connectTimeout.signal.aborted && !signal.aborted) {
      throw new ChatNetworkError('chat-service không mở stream trong thời hạn');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) throw await readErrorBody(res);
  if (!res.body)
    throw new ChatRequestError(res.status, 'stream_unavailable', 0);

  await readStream(res.body, onEvent);
}
