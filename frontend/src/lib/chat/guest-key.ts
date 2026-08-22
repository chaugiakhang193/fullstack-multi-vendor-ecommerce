import { GUEST_KEY_STORAGE } from '@/constants/chat';

// Độ dài tối thiểu chat-service chấp nhận (minGuestKeyLen trong internal/httpapi/subject.go).
const MIN_GUEST_KEY_LENGTH = 16;

// Sinh và giữ định danh khách vãng lai cho chat-service.
//
// Bắt buộc crypto.randomUUID() chứ không phải Math.random(): khoá này là bí mật duy nhất gắn
// hội thoại của một người khách, đoán trúng khoá là ngữ cảnh hội thoại của người khác đi vào
// prompt của model.
//
// BE chỉ nhận khoá 16..64 ký tự trong tập [A-Za-z0-9_-] — UUID 36 ký tự lọt đúng khuôn. Khoá
// sai khuôn bị BE BỎ LẶNG LẼ: bot vẫn trả lời bình thường nhưng không lưu gì cả, và đó chính
// là thứ làm tưởng phần lưu hội thoại hỏng.
export function getGuestKey(): string {
  if (typeof window === 'undefined') return '';

  try {
    const saved = window.localStorage.getItem(GUEST_KEY_STORAGE);
    if (saved && saved.length >= MIN_GUEST_KEY_LENGTH) return saved;

    const created = crypto.randomUUID();
    window.localStorage.setItem(GUEST_KEY_STORAGE, created);
    return created;
  } catch {
    // Trình duyệt chặn storage (Safari private mode chẳng hạn). Trả chuỗi rỗng để không gửi
    // header rác: vẫn hỏi được, chỉ là lượt này không được nhớ.
    return '';
  }
}
