import {
  RECONNECT_BASE_MS,
  RECONNECT_JITTER_MS,
  RECONNECT_MAX_MS,
  WS_CLOSE_UNAUTHORIZED,
} from '@/constants/direct-chat';
import { CHAT_SERVICE_URL } from '@/lib/chat/request';
import { useAuthStore } from '@/store/useAuthStore';
import type {
  DirectClientFrame,
  DirectServerFrame,
  DirectSocketStatus,
} from '@/types/direct-chat';

// Singleton, đúng khuôn lib/socket.ts của notification: cả trang /chat, trang /seller/messages
// lẫn badge trên nav đều đọc chung một kết nối. Mỗi component tự mở một socket nghĩa là mỗi tin
// đến vài lần và mỗi lần rời trang lại bắt tay + xác thực lại từ đầu.
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;

// Đã làm mới token cho lần đóng 4401 gần nhất hay chưa. Đặt lại về false mỗi lần nhận frame
// ready — một phiên đã chạy được thì lần hết hạn sau lại được quyền refresh một lần nữa.
let refreshedForThisSession = false;

// Người dùng chủ động đóng (đăng xuất, rời ứng dụng). Cờ này chặn vòng nối lại.
let closedOnPurpose = false;

interface SocketHandlers {
  onFrame: (frame: DirectServerFrame) => void;
  onStatus: (status: DirectSocketStatus) => void;
}

let handlers: SocketHandlers | null = null;

// Đổi http(s):// thành ws(s)://. Giữ nguyên phần còn lại của URL.
function socketUrl(): string {
  return `${CHAT_SERVICE_URL.replace(/^http/, 'ws')}/ws`;
}

function nextDelay(): number {
  const grown = RECONNECT_BASE_MS * 2 ** attempt;
  const capped = Math.min(grown, RECONNECT_MAX_MS);
  return capped + Math.random() * RECONNECT_JITTER_MS;
}

function clearTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

// Mở kết nối và gắn danh tính. Gọi lại nhiều lần an toàn: đang có kết nối sống thì không mở thêm.
export function connectDirectChat(next: SocketHandlers): void {
  handlers = next;
  closedOnPurpose = false;

  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const token = useAuthStore.getState().accessToken;
  if (!token) {
    // Ngay sau F5 hay vào thẳng URL /chat, accessToken chưa kịp hồi phục — AppProvider đang
    // silentRefresh() ở nền (dùng refresh-token cookie). chatFetch tự chờ được nhờ retry-sau-401
    // (xem lib/chat/request.ts), nhưng ở đây chưa có kết nối nào để nhận một cái 401 mà retry —
    // tự thử refresh rồi nối lại một lần, thay vì báo 'unauthorized' oan cho người đã đăng nhập
    // thật chỉ vì thua một cuộc đua timing.
    handlers.onStatus('connecting');
    void connectAfterInitialRefresh(next);
    return;
  }

  handlers.onStatus(attempt === 0 ? 'connecting' : 'reconnecting');

  const ws = new WebSocket(socketUrl());
  socket = ws;

  ws.onopen = () => {
    // Token đi trong frame ĐẦU TIÊN chứ không phải query param: query param sẽ nằm lại trong
    // access log của Render và Cloudflare. Server cho 5 giây để gửi frame này.
    const auth: DirectClientFrame = { type: 'auth', token };
    ws.send(JSON.stringify(auth));
  };

  ws.onmessage = (event) => {
    let frame: DirectServerFrame;
    try {
      frame = JSON.parse(event.data as string) as DirectServerFrame;
    } catch {
      // Server không gửi gì ngoài JSON. Bỏ qua thay vì làm sập vòng nhận tin.
      return;
    }

    if (frame.type === 'ready') {
      attempt = 0;
      refreshedForThisSession = false;
      handlers?.onStatus('ready');
    }
    handlers?.onFrame(frame);
  };

  ws.onclose = (event) => {
    socket = null;
    if (closedOnPurpose) return;

    if (event.code === WS_CLOSE_UNAUTHORIZED) {
      void handleUnauthorized();
      return;
    }

    scheduleReconnect();
  };

  // Không xử lý gì ở onerror: trình duyệt luôn bắn onclose ngay sau đó, và xử lý cả hai chỗ
  // sẽ đặt hai lịch nối lại cho cùng một lần rớt.
  ws.onerror = () => {};
}

// Không có token lúc mở kết nối: thử refresh đúng MỘT LẦN rồi nối lại.
//
// silentRefresh cập nhật accessToken vào store TRƯỚC KHI resolve true (xem useAuthStore), nên
// gọi lại connectDirectChat ngay sau đó luôn thấy token mới — không có vòng lặp.
//
// So `handlers !== next` sau await: nếu trong lúc chờ mà connectDirectChat đã bị gọi lại bằng
// một cặp handlers khác (component remount) hoặc disconnect() đã dọn handlers về null, tiếp tục
// bằng `next` cũ là thao tác trên một phiên đã chết.
async function connectAfterInitialRefresh(next: SocketHandlers): Promise<void> {
  const refreshed = await useAuthStore.getState().silentRefresh();
  if (handlers !== next) return;

  if (!refreshed) {
    next.onStatus('unauthorized');
    return;
  }
  connectDirectChat(next);
}

// Đóng 4401 = danh tính không dùng được. Làm mới token rồi nối lại ĐÚNG MỘT LẦN.
//
// Một lần là giới hạn cứng: nếu token mới cũng bị từ chối thì vấn đề không nằm ở token, và nối
// lại tiếp chỉ tạo một vòng lặp gõ cửa vô tận.
async function handleUnauthorized(): Promise<void> {
  if (refreshedForThisSession) {
    handlers?.onStatus('unauthorized');
    return;
  }
  refreshedForThisSession = true;

  // silentRefresh đã tự gộp các lần gọi trùng và tự đăng xuất khi thất bại — dùng lại đúng thứ
  // mà chatFetch đang dùng, không viết vòng refresh thứ ba trong dự án.
  const refreshed = await useAuthStore.getState().silentRefresh();
  if (!refreshed || !handlers) {
    handlers?.onStatus('unauthorized');
    return;
  }

  attempt = 0;
  connectDirectChat(handlers);
}

function scheduleReconnect(): void {
  if (!handlers || closedOnPurpose) return;

  clearTimer();
  handlers.onStatus('reconnecting');
  const delay = nextDelay();
  attempt += 1;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (handlers) connectDirectChat(handlers);
  }, delay);
}

// Gửi một tin. Trả false khi kết nối chưa sẵn sàng — nơi gọi tự đánh dấu tin là hỏng.
//
// KHÔNG xếp hàng đợi gửi sau: một tin gõ lúc mất mạng mà tự bay đi vài giây sau, khi người dùng
// đã bỏ đi hoặc đã gõ lại câu khác, gây khó hiểu hơn là một tin báo hỏng kèm nút gửi lại.
export function sendDirectFrame(frame: DirectClientFrame): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(frame));
  return true;
}

// Đóng hẳn: đăng xuất, hoặc rời khỏi khu vực có chat. Dừng luôn vòng nối lại.
export function disconnectDirectChat(): void {
  closedOnPurpose = true;
  clearTimer();
  attempt = 0;
  refreshedForThisSession = false;
  handlers = null;

  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
}
