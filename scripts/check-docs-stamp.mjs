// Guard CI: tài liệu có thay đổi thì dòng stamp của chính nó cũng phải đổi.
//
// Luật cố ý TOLERANT — chỉ so nội dung diff, KHÔNG so với `git log -1 --format=%cI`. Amend và
// rebase đổi commit time mà không đổi nội dung; so theo commit time sẽ đỏ oan đúng những lượt
// dọn lịch sử, và repo này đã từng phải cherry-pick + amend cả loạt commit một lần.
//
// Thiếu mốc để so (push đầu của một nhánh, hoặc clone nông không có base) thì bỏ qua chứ không
// đỏ: guard này để bắt người quên đóng dấu, không phải để chặn CI vì hình dạng checkout.
import { execFileSync } from "node:child_process";
import { inScope } from "./docs-stamp-lib.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

const base = (process.env.BASE_SHA ?? "").trim();
const head = (process.env.HEAD_SHA ?? "HEAD").trim();

if (!base || /^0+$/.test(base)) {
  console.log("Không có base commit để so — bỏ qua guard stamp.");
  process.exit(0);
}

try {
  git("cat-file", "-e", `${base}^{commit}`);
} catch {
  console.log(`Base ${base} không có trong checkout này — bỏ qua guard stamp.`);
  process.exit(0);
}

const changed = git("diff", "--name-only", "--diff-filter=ACM", base, head)
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .filter(inScope);

if (changed.length === 0) {
  console.log("Không có tài liệu nào đổi trong khoảng này.");
  process.exit(0);
}

const missing = changed.filter((file) => {
  const diff = git("diff", base, head, "--", file);
  return !diff.split("\n").some((l) => l.startsWith("+_Last updated: "));
});

if (missing.length > 0) {
  console.error("❌ Tài liệu đổi nội dung nhưng dòng stamp giữ nguyên:");
  for (const file of missing) console.error(`   ${file}`);
  console.error("");
  console.error("Chạy `npm run stamp:docs` sau khi `git add`, hoặc sửa tay dòng");
  console.error("`_Last updated: HH:MM ICT · DD/MM/YYYY_` ngay dưới H1 rồi commit lại.");
  process.exit(1);
}

console.log(`Stamp hợp lệ cho ${changed.length} tài liệu.`);
