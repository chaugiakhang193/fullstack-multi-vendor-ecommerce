// Chạy 1 LẦN — copy toàn bộ notification lịch sử từ DB gốc/shared sang DB#2
// (source of truth mới của NS). Idempotent: ON CONFLICT (id) DO NOTHING nên chạy
// lại không nhân đôi. KHÔNG copy processed_events (state tạm, bắt đầu sạch ở DB#2).
//
// Env: SOURCE_DATABASE_URL (shared), TARGET_DATABASE_URL (DB#2). Xem .env.
// Lệnh: node scripts/copy-notifications.mjs
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL = process.env.TARGET_DATABASE_URL;

// Tên bảng NGUỒN (prod shared đã rename thành notification_read ở Phase 6 part_03).
// Đích luôn là 'notification' (write model DB#2). Override qua SOURCE_TABLE nếu cần.
const SOURCE_TABLE = process.env.SOURCE_TABLE || "notification_read";

if (!SOURCE_URL || !TARGET_URL) {
  console.error("Thiếu SOURCE_DATABASE_URL hoặc TARGET_DATABASE_URL trong .env");
  process.exit(1);
}

// Postgres local (docker/localhost) không SSL; Supabase/remote bắt buộc SSL self-signed.
function sslFor(url) {
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return isLocal ? false : { rejectUnauthorized: false };
}
const BATCH = 500;

async function main() {
  const src = new Client({ connectionString: SOURCE_URL, ssl: sslFor(SOURCE_URL) });
  const dst = new Client({ connectionString: TARGET_URL, ssl: sslFor(TARGET_URL) });
  await src.connect();
  await dst.connect();

  try {
    const { rows: countRows } = await src.query(
      `SELECT count(*)::int AS n FROM ${SOURCE_TABLE}`,
    );
    const total = countRows[0].n;
    console.log(`[copy] Nguồn có ${total} notification. Bắt đầu copy...`);

    let offset = 0;
    let copied = 0;
    while (offset < total) {
      const { rows } = await src.query(
        `SELECT id, user_id, type, title, content, data, is_read, created_at
         FROM ${SOURCE_TABLE}
         ORDER BY created_at ASC
         LIMIT $1 OFFSET $2`,
        [BATCH, offset],
      );
      if (rows.length === 0) break;

      // Bỏ dòng user_id NULL (DB#2 yêu cầu NOT NULL). Log để biết có bỏ sót không.
      const valid = rows.filter((r) => r.user_id !== null);
      const skipped = rows.length - valid.length;
      if (skipped > 0) {
        console.warn(`[copy] Bỏ ${skipped} dòng user_id NULL (batch offset ${offset}).`);
      }

      for (const r of valid) {
        await dst.query(
          `INSERT INTO notification
             (id, user_id, type, title, content, data, is_read, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [
            r.id,
            r.user_id,
            r.type,
            r.title,
            r.content,
            r.data,
            r.is_read,
            r.created_at,
          ],
        );
        copied += 1;
      }
      offset += rows.length;
      console.log(`[copy] Tiến độ: ${Math.min(offset, total)}/${total}`);
    }

    const { rows: destRows } = await dst.query(
      `SELECT count(*)::int AS n FROM notification`,
    );
    console.log(
      `[copy] XONG. Đã insert ${copied} dòng. DB#2 hiện có ${destRows[0].n} notification.`,
    );
  } finally {
    await src.end();
    await dst.end();
  }
}

main().catch((err) => {
  console.error("[copy] Lỗi:", err);
  process.exit(1);
});
