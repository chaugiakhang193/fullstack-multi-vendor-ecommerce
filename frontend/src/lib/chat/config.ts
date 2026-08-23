import { CONFIG_CACHE_STORAGE } from '@/constants/chat';
import { CHAT_SERVICE_URL } from '@/lib/chat/request';

// Hỏi chat-service xem bot có đang bật không.
//
// Không đi qua chatFetch: endpoint này không cần danh tính, và gắn Authorization vào một request
// gọi ở mọi trang khách nghĩa là mỗi lần tải trang lại chạm vào token.
//
// Lỗi mạng trả về true chứ không phải false: chat-service ngủ đông trên gói free, và request đầu
// tiên sau một quãng im lặng rất dễ timeout. Ẩn bong bóng vì một lần gọi hụt là giấu mất tính
// năng trong khi bot hoàn toàn khoẻ — người dùng bấm vào rồi mới thấy lỗi vẫn tốt hơn là không
// có gì để bấm.
export async function fetchChatEnabled(): Promise<boolean> {
  const cached = readCache();
  if (cached !== null) return cached;

  try {
    const res = await fetch(`${CHAT_SERVICE_URL}/chat/config`);
    if (!res.ok) return true;

    const body = await res.json();
    // So với false chứ không ép sang boolean: body hỏng hoặc thiếu trường thì coi như bot đang
    // bật, cùng một lý do với nhánh lỗi mạng ở dưới.
    const enabled = body?.enabled !== false;
    writeCache(enabled);
    return enabled;
  } catch {
    return true;
  }
}

function readCache(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.sessionStorage.getItem(CONFIG_CACHE_STORAGE);
    if (saved === null) return null;
    return saved === 'true';
  } catch {
    return null;
  }
}

function writeCache(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(CONFIG_CACHE_STORAGE, String(enabled));
  } catch {
    // Trình duyệt chặn storage. Không sao: lần chuyển trang sau chỉ tốn thêm một request.
  }
}
