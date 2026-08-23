// Đưa chuỗi tiếng Việt về dạng so sánh được: thường hoá, bỏ dấu, bỏ dấu câu, gộp khoảng trắng.
//
// NFD tách "ế" thành "e" cộng một dấu tổ hợp, nên bước replace phía sau xoá được dấu đó. Nhưng
// "đ" (U+0111) là một ký tự riêng chứ không phải "d" mang dấu, NFD để nguyên nó và chuỗi kết quả
// vẫn còn "đ" — khi đó "dien thoai" không khớp "điện thoại". Vì vậy nó được thay bằng tay, và
// thay sau toLowerCase() để bắt cả "Đ" hoa.
export function normalizeVietnamese(input: string): string {
  return input
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
