import { readFileSync, writeFileSync } from "node:fs";

// Dòng mốc thời gian đặt ngay dưới H1 của mỗi tài liệu.
// Ví dụ: _Last updated: 14:30 ICT · 04/09/2026_
export const STAMP_RE = /^_Last updated: .*_$/m;

// Phạm vi đóng dấu. backend/README.md và frontend/README.md CỐ Ý nằm ngoài: chúng vẫn là
// README mẫu của NestJS/create-next-app, không ai viết và cũng không ai đọc để lấy số liệu.
// Đóng dấu lên chúng là nói dối rằng có người vừa rà lại nội dung.
export function inScope(file) {
  if (file === "README.md") return true;
  if (file === "notification-service/README.md") return true;
  return file.startsWith("docs/") && file.endsWith(".md");
}

// Giờ ICT lấy bằng cách dịch UTC +7 rồi đọc phần UTC của kết quả: CI chạy ở UTC còn máy dev
// ở ICT, mà con dấu phải giống nhau ở cả hai nơi.
export function ictStamp(date = new Date()) {
  const ict = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const hh = pad(ict.getUTCHours());
  const mm = pad(ict.getUTCMinutes());
  const dd = pad(ict.getUTCDate());
  const mo = pad(ict.getUTCMonth() + 1);
  const yyyy = ict.getUTCFullYear();
  return `_Last updated: ${hh}:${mm} ICT · ${dd}/${mo}/${yyyy}_`;
}

// README gốc là ngoại lệ về vị trí: sau H1 là câu pitch rồi khối 3 link mà nhà tuyển dụng đọc
// đầu tiên, chèn con dấu vào giữa là cắt ngang đúng chỗ đó. Đặt ngay sau khối link.
function anchorIndex(file, lines) {
  if (file === "README.md") {
    const i = lines.findIndex((l) => l.startsWith("**[Source]("));
    if (i !== -1) return i;
  }
  return lines.findIndex((l) => l.startsWith("# "));
}

// Ghi con dấu vào file: thay tại chỗ nếu đã có, chèn sau mốc neo nếu chưa.
// Trả về true khi file thật sự đổi.
export function writeStamp(file, stamp) {
  const original = readFileSync(file, "utf8");
  if (STAMP_RE.test(original)) {
    const updated = original.replace(STAMP_RE, stamp);
    if (updated === original) return false;
    writeFileSync(file, updated);
    return true;
  }

  const lines = original.split("\n");
  const at = anchorIndex(file, lines);
  if (at === -1) return false;

  lines.splice(at + 1, 0, "", stamp);
  writeFileSync(file, lines.join("\n"));
  return true;
}
