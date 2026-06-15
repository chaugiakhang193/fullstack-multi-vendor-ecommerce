import { io, Socket } from "socket.io-client";

// Cùng origin với REST API — gateway không mở port riêng (chia sẻ HTTP port).
// NEXT_PUBLIC_API_URL có path "/api/v1" → socket.io-client hiểu "/api/v1" là namespace
// (namespace mặc định gateway là "/") → cần lấy origin thuần (bỏ path).
const _apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
const SOCKET_URL = _apiUrl ? new URL(_apiUrl).origin : "";

let socket: Socket | null = null;

// Singleton lazy. autoConnect:false để tự chủ thời điểm connect (chỉ khi đã đăng nhập).
// withCredentials:true giữ nguyên cho cross-origin cookie (refresh_token v.v.).
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
    });
  }
  return socket;
}

// token: access_token từ Zustand — gateway đọc qua handshake.auth.token.
export function connectSocket(token: string): Socket {
  const s = getSocket();
  s.auth = { token };
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
