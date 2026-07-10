// @ts-check
/**
 * gen-contracts — đồng bộ contract (type thuần) từ backend sang notification-service.
 *
 * Backend là canonical. Không dùng npm workspace (2 project độc lập, Docker build
 * context tách riêng) nên không thể re-export trực tiếp — generator COPY nội dung
 * text, viết lại import enum để trỏ vào file generated cùng thư mục.
 *
 * Sinh 5 file (chỉ type/interface/enum/entity thuần, KHÔNG logic/DI):
 *   - contracts/enums.generated.ts              (NotificationType, OrderStatus, PayoutStatus, ReturnStatus)
 *   - contracts/outbox.constants.generated.ts   (OUTBOX_EVENT_TYPES + payload interfaces)
 *   - contracts/notification.data.generated.ts  (NotificationData union)
 *   - contracts/notification.entity.generated.ts (Notification TypeORM entity, flatten cho NS)
 *   - contracts/ws-events.generated.ts          (WS_EVENTS, WsPayloadMap, room builder, WsEmit, factory)
 *
 * Chạy: npm run gen-contracts
 */
import ts from "typescript";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BE_ENUMS = resolve(__dirname, "../../backend/src/common/enums.ts");
const BE_OUTBOX_CONSTANTS = resolve(
  __dirname,
  "../../backend/src/common/constants/outbox.constants.ts",
);
const BE_NOTIFICATION_DATA = resolve(
  __dirname,
  "../../backend/src/modules/engagements/notification.data.ts",
);
const BE_NOTIFICATION_ENTITY = resolve(
  __dirname,
  "../../backend/src/modules/engagements/entities/notification.entity.ts",
);
const BE_WS_EVENTS = resolve(
  __dirname,
  "../../backend/src/modules/engagements/notification.events.ts",
);

const OUT_DIR = resolve(__dirname, "../src/contracts");
const OUT_ENUMS = resolve(OUT_DIR, "enums.generated.ts");
const OUT_OUTBOX_CONSTANTS = resolve(OUT_DIR, "outbox.constants.generated.ts");
const OUT_NOTIFICATION_DATA = resolve(
  OUT_DIR,
  "notification.data.generated.ts",
);
const OUT_NOTIFICATION_ENTITY = resolve(
  OUT_DIR,
  "notification.entity.generated.ts",
);
const OUT_WS_EVENTS = resolve(OUT_DIR, "ws-events.generated.ts");

// Chỉ những enum mà payload/data contract thật sự dùng tới.
const ALLOWLIST = [
  "NotificationType",
  "OrderStatus",
  "PayoutStatus",
  "ReturnStatus",
];

/**
 * @param {string} sourceRelPath
 * @returns {string}
 */
function banner(sourceRelPath) {
  return (
    `// AUTO-GENERATED bởi notification-service/scripts/gen-contracts.mjs — DO NOT EDIT.\n` +
    `// Nguồn: ${sourceRelPath}. Chạy lại: npm run gen-contracts.\n`
  );
}

// ---------------------------------------------------------------------------
// 1. enums.generated.ts — trích enum bằng TS Compiler API (như gen-enums.mjs FE)
// ---------------------------------------------------------------------------
function genEnums() {
  const source = readFileSync(BE_ENUMS, "utf8");
  const sourceFile = ts.createSourceFile(
    BE_ENUMS,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );

  /** @type {Map<string, { name: string; value: string }[]>} */
  const found = new Map();

  sourceFile.forEachChild((node) => {
    if (!ts.isEnumDeclaration(node)) return;
    const enumName = node.name.text;
    if (!ALLOWLIST.includes(enumName)) return;

    const members = node.members.map((member) => {
      const memberName = member.name.getText(sourceFile);
      if (!member.initializer || !ts.isStringLiteral(member.initializer)) {
        throw new Error(
          `[gen-contracts] ${enumName}.${memberName} không phải string literal. ` +
            `Script chỉ hỗ trợ string enum.`,
        );
      }
      return { name: memberName, value: member.initializer.text };
    });

    found.set(enumName, members);
  });

  const missing = ALLOWLIST.filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new Error(
      `[gen-contracts] Không tìm thấy enum trong ${BE_ENUMS}: ${missing.join(", ")}`,
    );
  }

  const blocks = ALLOWLIST.map((enumName) => {
    const members = /** @type {{name:string,value:string}[]} */ (
      found.get(enumName)
    );
    const body = members
      .map((m) => `  ${m.name} = ${JSON.stringify(m.value)},`)
      .join("\n");
    return `export enum ${enumName} {\n${body}\n}`;
  });

  return (
    banner("backend/src/common/enums.ts") + "\n" + blocks.join("\n\n") + "\n"
  );
}

// ---------------------------------------------------------------------------
// 2 & 3. Copy text — giữ nguyên interface/type/const, chỉ viết lại dòng import
//        enum để trỏ vào './enums.generated' thay vì '@/common/enums'.
// ---------------------------------------------------------------------------
/**
 * @param {string} sourcePath
 * @param {string} sourceBanner
 * @returns {string}
 */
function copyWithRewrittenEnumImport(sourcePath, sourceBanner) {
  const raw = readFileSync(sourcePath, "utf8");
  const lines = raw.split("\n");

  const rewritten = lines.filter((line) => {
    // Bỏ dòng import gốc trỏ tới '@/common/enums' — sẽ chèn lại bằng import mới.
    return !/from ['"]@\/common\/enums['"]/.test(line);
  });

  const enumImportRegex =
    /import\s*{([^}]+)}\s*from\s*['"]@\/common\/enums['"];?/;
  const match = raw.match(enumImportRegex);
  const importedNames = match ? match[1].trim() : "";

  const newImport = importedNames
    ? `import { ${importedNames} } from './enums.generated';\n`
    : "";

  return (
    sourceBanner + "\n" + newImport + rewritten.join("\n").replace(/^\n+/, "")
  );
}

function genOutboxConstants() {
  return copyWithRewrittenEnumImport(
    BE_OUTBOX_CONSTANTS,
    banner("backend/src/common/constants/outbox.constants.ts"),
  );
}

function genNotificationData() {
  return copyWithRewrittenEnumImport(
    BE_NOTIFICATION_DATA,
    banner("backend/src/modules/engagements/notification.data.ts"),
  );
}

// ---------------------------------------------------------------------------
// 4. notification.entity.generated.ts — NS ghi (write-only), không bao giờ
//    load/join User → quan hệ `user: User` (ManyToOne) flatten thành cột thuần
//    `user_id: string`. NS không có (và không cần) User entity. @Index tham
//    chiếu property `user` bị DROP theo — index vốn no-op ở NS
//    (synchronize:false, index thật do backend migration dựng).
// ---------------------------------------------------------------------------
function genNotificationEntity() {
  const raw = readFileSync(BE_NOTIFICATION_ENTITY, "utf8");

  const out = raw
    .replace(
      "import { User } from '@/modules/users/entities/user.entity';\n",
      "",
    )
    .replace("@Index(['user', 'is_read', 'created_at'])\n", "")
    .replace(
      `import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';`,
      "import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';",
    )
    .replace(
      `  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;`,
      `  @Column({ name: 'user_id', type: 'uuid' })
  user_id: string;`,
    )
    .replace("from '@/common/enums'", "from './enums.generated'")
    .replace(
      "from '@/modules/engagements/notification.data'",
      "from './notification.data.generated'",
    );

  if (out === raw) {
    throw new Error(
      `[gen-contracts] notification.entity.ts không khớp pattern kỳ vọng — kiểm tra lại backend entity có đổi shape.`,
    );
  }

  return (
    banner("backend/src/modules/engagements/entities/notification.entity.ts") +
    "\n" +
    out
  );
}

// ---------------------------------------------------------------------------
// 5. ws-events.generated.ts — notification.events.ts KHÔNG import gì ngoài
//    (self-contained: WS_EVENTS, payload interfaces, WsPayloadMap, WsEventName,
//    room builder, WsEmit, factory toUser/toShop/toAdmins) → copy thuần,
//    không cần rewrite import (P5-3).
// ---------------------------------------------------------------------------
function genWsEvents() {
  const raw = readFileSync(BE_WS_EVENTS, "utf8");
  return (
    banner("backend/src/modules/engagements/notification.events.ts") +
    "\n" +
    raw
  );
}

// ---------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });

writeFileSync(OUT_ENUMS, genEnums(), "utf8");
writeFileSync(OUT_OUTBOX_CONSTANTS, genOutboxConstants(), "utf8");
writeFileSync(OUT_NOTIFICATION_DATA, genNotificationData(), "utf8");
writeFileSync(OUT_NOTIFICATION_ENTITY, genNotificationEntity(), "utf8");
writeFileSync(OUT_WS_EVENTS, genWsEvents(), "utf8");

console.log(
  "[gen-contracts] Đã sinh 5 file contract -> notification-service/src/contracts/*.generated.ts",
);
