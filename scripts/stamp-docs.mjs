// Pre-commit: đóng dấu giờ cho tài liệu đang staged rồi add lại.
//
// Chỉ đóng dấu file có thay đổi NGOÀI dòng stamp. Nhờ vậy đợt backfill (mỗi file chỉ thêm đúng
// một dòng stamp) không bị hook ghi đè bằng giờ hiện tại, và một lần amend chỉ để sửa stamp
// cũng không tự sinh ra thay đổi mới.
import { execFileSync } from "node:child_process";
import { inScope, ictStamp, writeStamp } from "./docs-stamp-lib.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

const staged = git("diff", "--cached", "--name-only", "--diff-filter=ACM")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .filter(inScope);

if (staged.length === 0) process.exit(0);

const stamp = ictStamp();
const stamped = [];

for (const file of staged) {
  const diff = git("diff", "--cached", "-U0", "--", file);
  const changed = diff
    .split("\n")
    .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l))
    .filter((l) => !/^[+-]_Last updated: /.test(l))
    // Dòng trắng thêm/bớt không phải nội dung. Nhờ luật này, đợt backfill (chèn stamp + một
    // dòng trắng) không tự kích hoạt hook và giữ được mốc lịch sử của từng file.
    .filter((l) => l.slice(1).trim() !== "");

  if (changed.length === 0) continue;
  if (!writeStamp(file, stamp)) continue;

  git("add", "--", file);
  stamped.push(file);
}

if (stamped.length > 0) {
  console.log(`📌 Đã đóng dấu ${stamp.slice(1, -1)}:`);
  for (const file of stamped) console.log(`   ${file}`);
}
