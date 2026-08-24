import { getGuestKey } from '@/lib/chat/guest-key';
import { useAuthStore } from '@/store/useAuthStore';
import type {
  ChatMessage,
  ChatProductsMessage,
  ChatTextMessage,
} from '@/types/chat';

// Sống 24 giờ. Đủ để quay lại trong ngày, đủ ngắn để không thấy hội thoại tuần trước đội lên.
const SHORTCUT_TTL_MS = 24 * 60 * 60 * 1000;

// Cắt cũ trước khi vượt ngưỡng. Không phải vì dung lượng — mà để mở panel lên không gặp một
// dãy dài toàn thẻ sản phẩm.
const MAX_SHORTCUT_ENTRIES = 10;

interface ShortcutEntry {
  userText: string;
  categoryId: string;
  categoryName: string;
  at: number;
}

// Khoá theo DANH TÍNH, không theo trình duyệt.
//
// GET /chat/history trả hội thoại theo guest key hoặc user id, còn localStorage thì theo máy.
// Khách duyệt vài ngày rồi đăng nhập: BE trả hội thoại của tài khoản, mà localStorage vẫn giữ
// khối chip từ hồi làm khách → hai danh tính trộn vào nhau trên cùng một màn hình. Đổi danh tính
// là tự nhiên nhìn sang ngăn khác.
function storageKey(): string {
  const userId = useAuthStore.getState().user?.id;
  if (userId) return `chat_shortcut_u_${userId}`;

  const guestKey = getGuestKey();
  if (guestKey) return `chat_shortcut_g_${guestKey}`;
  return '';
}

function readEntries(): ShortcutEntry[] {
  if (typeof window === 'undefined') return [];
  const key = storageKey();
  if (key === '') return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const cutoff = Date.now() - SHORTCUT_TTL_MS;
    return parsed.filter(
      (entry: ShortcutEntry) =>
        typeof entry?.categoryId === 'string' &&
        typeof entry?.at === 'number' &&
        entry.at > cutoff,
    );
  } catch {
    return [];
  }
}

function writeEntries(entries: ShortcutEntry[]): void {
  if (typeof window === 'undefined') return;
  const key = storageKey();
  if (key === '') return;

  try {
    window.localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // Storage đầy hoặc bị chặn. Mất phần nhớ, không mất phần đang dùng.
  }
}

// Ghi lại một lượt bấm chip. Lưu THAM CHIẾU danh mục, không lưu sản phẩm đã lấy về: giá và tồn
// kho phải tươi mỗi lần vẽ.
export function rememberShortcut(
  userMessage: ChatTextMessage,
  productsMessage: ChatProductsMessage,
): void {
  const entry: ShortcutEntry = {
    userText: userMessage.text,
    categoryId: productsMessage.categoryId,
    categoryName: productsMessage.categoryName,
    at: userMessage.at,
  };
  const next = [...readEntries(), entry].slice(-MAX_SHORTCUT_ENTRIES);
  writeEntries(next);
}

// Dựng lại các khối chip đã lưu thành tin nhắn.
//
// Sinh id mới mỗi lần thay vì lưu id cũ: id chỉ dùng làm React key trong phiên này, lưu xuống
// storage là lưu một thứ không ai đọc lại.
export function loadShortcutMessages(): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const entry of readEntries()) {
    messages.push({
      kind: 'text',
      id: crypto.randomUUID(),
      role: 'user',
      text: entry.userText,
      at: entry.at,
    });
    messages.push({
      kind: 'products',
      id: crypto.randomUUID(),
      categoryId: entry.categoryId,
      categoryName: entry.categoryName,
      at: entry.at + 1,
    });
  }
  return messages;
}
