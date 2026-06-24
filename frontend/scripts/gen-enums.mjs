// @ts-check
/**
 * gen-enums — đồng bộ enum từ backend sang frontend.
 *
 * Đọc backend/src/common/enums.ts (string enums) qua TypeScript Compiler API,
 * lọc theo ALLOWLIST, rồi sinh src/constants/enum.generated.ts.
 *
 * Vì sao không dùng gen-api/openapi: openapi-typescript chỉ sinh KIỂU (union string),
 * còn FE cần ENUM runtime (UserRole.ADMIN, z.nativeEnum(...), so sánh trong code).
 * Ưu điểm so với gen-api: đọc file trực tiếp, KHÔNG cần backend chạy.
 *
 * Chạy: npm run gen-enums
 */
import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BE_ENUMS = resolve(__dirname, '../../backend/src/common/enums.ts');
const OUT_FILE = resolve(__dirname, '../src/constants/enum.generated.ts');

// Chỉ những enum FE thật sự cần. KHÔNG lấy enum nội bộ BE
// (IdempotencyStatus, OutboxEventStatus, AssetType FE chưa dùng).
// CartConflictReason KHÔNG nằm đây: nó là FE-only (superset = CartItemUnavailableReason
// + price_changed, price_changed là khái niệm thuần FE) → giữ tay trong enum.ts.
const ALLOWLIST = [
  'UserRole',
  'AccountStatus',
  'OrderStatus',
  'PaymentMethod',
  'PaymentStatus',
  'CouponType',
  'DiscountType',
  'VerificationTokenType',
  'ProductStatus',
  'NotificationType',
  'CartItemUnavailableReason',
];

const source = readFileSync(BE_ENUMS, 'utf8');
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
        `[gen-enums] ${enumName}.${memberName} không phải string literal. ` +
          `Script chỉ hỗ trợ string enum.`,
      );
    }
    return { name: memberName, value: member.initializer.text };
  });

  found.set(enumName, members);
});

// Fail loud nếu allowlist khai báo enum không tồn tại bên BE (tránh sinh thiếu âm thầm).
const missing = ALLOWLIST.filter((name) => !found.has(name));
if (missing.length > 0) {
  throw new Error(
    `[gen-enums] Không tìm thấy enum trong ${BE_ENUMS}: ${missing.join(', ')}`,
  );
}

// Sinh nội dung theo ĐÚNG thứ tự ALLOWLIST cho deterministic.
const banner =
  '// ⚠️ AUTO-GENERATED bởi scripts/gen-enums.mjs — KHÔNG SỬA TAY.\n' +
  '// Nguồn: backend/src/common/enums.ts. Chạy lại: npm run gen-enums.\n';

const blocks = ALLOWLIST.map((enumName) => {
  const members = /** @type {{name:string,value:string}[]} */ (
    found.get(enumName)
  );
  const body = members
    .map((m) => `  ${m.name} = ${JSON.stringify(m.value)},`)
    .join('\n');
  return `export enum ${enumName} {\n${body}\n}`;
});

const output = banner + '\n' + blocks.join('\n\n') + '\n';

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, output, 'utf8'); // utf8 = no BOM; \n = LF

console.log(
  `[gen-enums] Đã sinh ${ALLOWLIST.length} enum -> src/constants/enum.generated.ts`,
);
