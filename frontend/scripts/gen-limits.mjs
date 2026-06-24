// @ts-check
// gen-limits — đồng bộ limit số từ backend sang frontend.
// Đọc backend/src/common/limits.ts qua TS Compiler API, lọc theo ALLOWLIST,
// sinh src/constants/limits.generated.ts. Chỉ hỗ trợ literal số + object lồng nhau.
import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BE = resolve(__dirname, '../../backend/src/common/limits.ts');
const OUT = resolve(__dirname, '../src/constants/limits.generated.ts');

const ALLOWLIST = [
  'AUTH_LIMITS',
  'PRODUCT_LIMITS',
  'SHOP_LIMITS',
  'BANK_LIMITS',
  'COUPON_LIMITS',
  'REVIEW_LIMITS',
  'CART_LIMITS',
  'USER_LIMITS',
  'ORDER_LIMITS',
  'PAYOUT_LIMITS',
  'SHIPPING_LIMITS',
  'CATEGORY_LIMITS',
];

const sf = ts.createSourceFile(
  BE,
  readFileSync(BE, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);

/** Đệ quy: chỉ chấp nhận số / số âm / object literal. Khác → throw (fail-loud). */
function evalNode(node, path) {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken
  )
    return -evalNode(node.operand, path);
  if (ts.isObjectLiteralExpression(node)) {
    const obj = {};
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p))
        throw new Error(`[gen-limits] ${path}: chỉ hỗ trợ property assignment`);
      obj[p.name.getText(sf)] = evalNode(
        p.initializer,
        `${path}.${p.name.getText(sf)}`,
      );
    }
    return obj;
  }
  throw new Error(`[gen-limits] ${path}: value không phải literal số/object`);
}

const found = new Map();
sf.forEachChild((node) => {
  if (!ts.isVariableStatement(node)) return;
  for (const d of node.declarationList.declarations) {
    const name = d.name.getText(sf);
    if (!ALLOWLIST.includes(name) || !d.initializer) continue;
    // bỏ "as const" bọc ngoài nếu có
    let init = d.initializer;
    if (ts.isAsExpression(init)) init = init.expression;
    found.set(name, evalNode(init, name));
  }
});

const missing = ALLOWLIST.filter((n) => !found.has(n));
if (missing.length)
  throw new Error(`[gen-limits] Thiếu trong ${BE}: ${missing.join(', ')}`);

const banner =
  '// ⚠️ AUTO-GENERATED bởi scripts/gen-limits.mjs — KHÔNG SỬA TAY.\n' +
  '// Nguồn: backend/src/common/limits.ts. Chạy lại: npm run gen-limits.\n\n';
const body = ALLOWLIST.map(
  (n) =>
    `export const ${n} = ${JSON.stringify(found.get(n), null, 2)} as const;`,
).join('\n\n');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, banner + body + '\n', 'utf8');
console.log(
  `[gen-limits] Đã sinh ${ALLOWLIST.length} nhóm -> src/constants/limits.generated.ts`,
);
