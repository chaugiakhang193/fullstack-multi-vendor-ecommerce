/**
 * Chốt an toàn cho TypeORM CLI của Notification-Service: chặn `migration:run` /
 * `migration:generate` / `migration:revert` chạy nhầm từ máy dev lên DB thật.
 *
 * Bối cảnh: `notification-service/.env` trỏ THẲNG Supabase prod (DB#2) — đó là cấu
 * hình đúng cho app runtime, nhưng cũng có nghĩa gõ nhầm `npm run migration:run` ở
 * local là đổi schema prod, và `migration:revert` là DROP thẳng bảng prod. Backend đã
 * có chốt tương tự cho seed (`src/common/helpers/assert-local-db.ts`); NS thì chưa,
 * dù rủi ro cao hơn vì .env mặc định là prod chứ không phải localhost.
 *
 * Cách phân biệt "deploy thật" vs "lỡ tay ở local": NODE_ENV. Render/Dockerfile luôn
 * đặt NODE_ENV=production (Dockerfile:17 + render.yaml), và migration prod chạy qua
 * `migration:run:prod` trong CMD của image → guard tự bỏ qua, deploy không đổi hành vi.
 * Ở local `.env` là NODE_ENV=development → guard bắt buộc DB_HOST phải là localhost.
 *
 * Cố ý chạy migration lên DB remote từ máy dev (hotfix schema chẳng hạn) thì phải bật
 * cờ `ALLOW_REMOTE_MIGRATION=YES_I_AM_SURE` — một thao tác có chủ đích, không thể lỡ tay.
 */
const LOCAL_HOSTS = [
  "",
  "localhost",
  "127.0.0.1",
  "::1",
  "host.docker.internal",
];

export function assertLocalDbOrExplicitOverride(scriptName: string): void {
  // Deploy thật (Render chạy image, NODE_ENV=production): migration lên Supabase là
  // ĐÚNG mục đích — không chặn, nếu không NS sẽ không boot nổi.
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const dbHost = (process.env.DB_HOST || "localhost").trim();
  const isLocal = LOCAL_HOSTS.includes(dbHost);
  const override = process.env.ALLOW_REMOTE_MIGRATION === "YES_I_AM_SURE";

  if (!isLocal && !override) {
    console.error(
      [
        "",
        `⛔ ${scriptName} ĐÃ DỪNG — chốt an toàn.`,
        `   DB_HOST="${dbHost}" KHÔNG phải localhost, mà NODE_ENV cũng không phải production.`,
        "   Nghĩa là bạn đang ở máy dev nhưng lại trỏ vào DB thật (notification-service/.env",
        "   mặc định trỏ Supabase prod DB#2) — migration ở đây sẽ đổi/DROP schema prod.",
        "",
        "   Muốn chạy trên DB local: sửa DB_HOST trong .env về localhost.",
        "   Nếu CỐ Ý migrate DB remote này, chạy lại với cờ môi trường:",
        `   ALLOW_REMOTE_MIGRATION=YES_I_AM_SURE npm run <script>`,
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  if (!isLocal && override) {
    console.warn(
      `⚠️  ${scriptName}: đang chạy migration lên DB REMOTE (DB_HOST="${dbHost}") — override bật. Chắc chắn đây là chủ đích!`,
    );
  }
}
