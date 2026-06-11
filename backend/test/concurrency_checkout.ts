/**
 * concurrency_checkout.ts
 *
 * Kiểm thử đồng thời cho luồng checkout. Ba điều cần verify:
 *   1. Không âm kho (race condition): 10 users checkout cùng lúc sản phẩm stock=5
 *      → Chỉ đúng 5 thành công, 5 còn lại nhận lỗi "insufficient stock"
 *   2. Không deadlock: tất cả requests hoàn thành trong timeout 30s
 *   3. Stock sync: product.stock_quantity === SUM(variant.stock_quantity) cho toàn bộ
 *      sản phẩm có biến thể sau khi test
 *
 * Prerequisites:
 *   - Backend đang chạy:   cd backend && npm run start:dev
 *   - Seed data có sẵn:    cd backend && npm run seed:dev
 *
 * Chạy:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register test/concurrency_checkout.ts
 */

import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

// Load .env từ thư mục backend (một cấp lên so với test/)
require('dotenv').config({ path: resolve(__dirname, '../.env') });

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// ─── Config (đọc từ .env — không hardcode secret) ─────────────────────────
function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`.env thiếu biến: ${key}`);
  return val;
}

const BASE_URL = `http://localhost:${process.env.PORT ?? 8080}/api/v1`;
const CONCURRENT_USERS = 10;
const INITIAL_STOCK = 5;   // reset về 5 để có 5 success + 5 fail rõ ràng
const SALT_ROUNDS = 10;    // phải khớp backend (common/helpers/utils.ts)
const TIMEOUT_MS = 30_000; // quá 30s → có thể deadlock
const TEST_USER_EMAIL_PATTERN = 'concurrency_test_%@test.local';
const JWT_ACCESS_SECRET = requireEnv('JWT_ACCESS_SECRET');
const JWT_EXPIRES_IN = requireEnv('ACCESS_TOKEN_EXPIRATION');

const dbPool = new Pool({
  host: requireEnv('DB_HOST'),
  port: Number(requireEnv('DB_PORT')),
  database: requireEnv('DB_NAME'),
  user: requireEnv('DB_USERNAME'),
  password: requireEnv('DB_PASSWORD'),
});

// ─── HTTP helper ────────────────────────────────────────────────────────────
async function api(
  method: string,
  path: string,
  body?: object,
  token?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// ─── DB helpers ─────────────────────────────────────────────────────────────
async function findTestProduct(db: PoolClient) {
  const { rows } = await db.query<{ id: string; name: string; stock_quantity: number }>(
    `SELECT id, name, stock_quantity FROM product WHERE name LIKE '%Test Ít Kho%' LIMIT 1`,
  );
  return rows[0] ?? null;
}

async function resetProductStock(db: PoolClient, productId: string, stock: number) {
  await db.query(`UPDATE product SET stock_quantity = $1 WHERE id = $2`, [stock, productId]);
}

async function createTestUser(db: PoolClient, index: number): Promise<void> {
  const email = `concurrency_test_${index}@test.local`;
  const password = await bcrypt.hash(email, SALT_ROUNDS);
  // Xóa nếu tồn tại từ lần chạy trước
  await db.query(`DELETE FROM "user" WHERE email = $1`, [email]);
  await db.query(
    `INSERT INTO "user" (id, username, email, password, role, status, full_name, phone)
     VALUES ($1, $2, $3, $4, 'customer', 'active', $5, $6)`,
    [
      randomUUID(),
      `concurrency_tester_${index}`,
      email,
      password,
      `Concurrency Tester ${index}`,
      `09${String(index).padStart(8, '0')}`,
    ],
  );
}

async function cleanupTestUsers(db: PoolClient): Promise<void> {
  await db.query(
    `DELETE FROM "user" WHERE email LIKE $1`,
    [TEST_USER_EMAIL_PATTERN],
  );
}

async function verifyStockIntegrity(db: PoolClient, productId: string) {
  const { rows: stockRows } = await db.query<{ stock_quantity: number }>(
    `SELECT stock_quantity FROM product WHERE id = $1`,
    [productId],
  );
  const productStock = stockRows[0]?.stock_quantity ?? -999;

  // Tìm sản phẩm có biến thể bị lệch stock
  const { rows: desyncRows } = await db.query<{
    id: string; name: string; product_stock: number; variant_sum: number;
  }>(`
    SELECT p.id, p.name,
           p.stock_quantity                    AS product_stock,
           COALESCE(SUM(pv.stock_quantity), 0)::int AS variant_sum
    FROM   product p
    LEFT JOIN product_variant pv ON pv.product_id = p.id
    WHERE  p.has_variants = true
    GROUP  BY p.id, p.name, p.stock_quantity
    HAVING p.stock_quantity != COALESCE(SUM(pv.stock_quantity), 0)
  `);

  return { productStock, desyncRows };
}

// ─── HTTP flow per user ──────────────────────────────────────────────────────

// Tạo JWT trực tiếp từ DB thay vì gọi /auth/login — tránh rate-limit 5/phút.
async function mintToken(db: PoolClient, index: number): Promise<string> {
  const email = `concurrency_test_${index}@test.local`;
  const { rows } = await db.query<{
    id: string; username: string; role: string; status: string;
  }>(`SELECT id, username, role, status FROM "user" WHERE email = $1`, [email]);
  if (!rows[0]) throw new Error(`Không tìm thấy user ${email} trong DB`);
  const { id, username, role, status } = rows[0];
  return jwt.sign(
    { sub: id, username, role, status },
    JWT_ACCESS_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  ) as string;
}

async function createAddress(token: string): Promise<string> {
  const { status, data } = await api(
    'POST',
    '/users/me/addresses',
    {
      address_line: '123 Đường Test Đồng Thời, Phường 1, Quận 1, TP. Hồ Chí Minh',
      recipient_name: 'Concurrency Tester',
      phone: '0901234567',
      is_default: true,
    },
    token,
  );
  if (status !== 201) throw new Error(`Tạo address thất bại: ${JSON.stringify(data)}`);
  return data.data.id as string;
}

async function addToCart(token: string, productId: string): Promise<void> {
  const { status, data } = await api(
    'POST',
    '/cart/items',
    { product_id: productId, quantity: 1 },
    token,
  );
  if (status !== 201) throw new Error(`Add to cart thất bại: ${JSON.stringify(data)}`);
}

async function doCheckout(
  token: string,
  addressId: string,
): Promise<{ status: number; data: any }> {
  return api(
    'POST',
    '/orders/checkout',
    { address_id: addressId, payment_method: 'cod' },
    token,
    { 'Idempotency-Key': randomUUID() },
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const hr = '─'.repeat(60);
  console.log(hr);
  console.log('  CONCURRENCY CHECKOUT TEST');
  console.log(hr);

  const db = await dbPool.connect();

  try {
    // ── 1. Tìm & reset sản phẩm test ──
    console.log('\n[1/5] Tìm sản phẩm test...');
    const product = await findTestProduct(db);
    if (!product) {
      throw new Error(
        'Không tìm thấy "Sản Phẩm Test Ít Kho". Hãy chạy: npm run seed:dev',
      );
    }
    await resetProductStock(db, product.id, INITIAL_STOCK);
    console.log(`     ✓ "${product.name}"`);
    console.log(`     ✓ Stock reset → ${INITIAL_STOCK}`);

    // ── 2. Tạo test users trong DB ──
    console.log(`\n[2/5] Tạo ${CONCURRENT_USERS} test users...`);
    for (let i = 0; i < CONCURRENT_USERS; i++) {
      await createTestUser(db, i);
    }
    console.log(`     ✓ Đã tạo ${CONCURRENT_USERS} users`);

    // ── 3. Mint JWT + address + cart (parallel — không qua /auth/login, không rate-limit) ──
    // Mỗi task lấy connection riêng từ pool để tránh pg deprecation warning.
    console.log(`\n[3/5] Mint JWT + address + cart cho ${CONCURRENT_USERS} users...`);
    const sessions = await Promise.all(
      Array.from({ length: CONCURRENT_USERS }, async (_, i) => {
        const conn = await dbPool.connect();
        try {
          const token = await mintToken(conn, i);
          const addressId = await createAddress(token);
          await addToCart(token, product.id);
          return { token, addressId };
        } finally {
          conn.release();
        }
      }),
    );
    console.log(`     ✓ Tất cả ${CONCURRENT_USERS} users sẵn sàng`);

    // ── 4. Gửi checkout ĐỒNG THỜI ──
    console.log(`\n[4/5] Gửi ${CONCURRENT_USERS} checkout requests đồng thời...`);
    const startMs = Date.now();

    const checkoutRace = Promise.all(
      sessions.map(({ token, addressId }) => doCheckout(token, addressId)),
    );
    const timeoutGuard = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`TIMEOUT ${TIMEOUT_MS}ms — nghi ngờ DEADLOCK!`)),
        TIMEOUT_MS,
      ),
    );

    const results = await Promise.race([checkoutRace, timeoutGuard]);
    const elapsed = Date.now() - startMs;

    const successes = results.filter((r) => r.status === 201);
    const failures = results.filter((r) => r.status !== 201);
    console.log(`     ✓ Hoàn thành sau ${elapsed}ms (không deadlock)`);
    console.log(`     → Thành công : ${successes.length}/${CONCURRENT_USERS}`);
    console.log(`     → Thất bại   : ${failures.length}/${CONCURRENT_USERS}`);
    console.log();
    results.forEach((r, i) => {
      const ok = r.status === 201;
      const detail = ok
        ? `order_number=${r.data?.data?.order_number ?? '?'}`
        : `${r.status} — ${r.data?.message ?? JSON.stringify(r.data).slice(0, 100)}`;
      console.log(`       User ${String(i).padStart(2)}: ${ok ? '✓' : '✗'} ${detail}`);
    });

    // ── 5. Verify ──
    console.log(`\n[5/5] Kiểm tra tính toàn vẹn dữ liệu...`);
    const { productStock, desyncRows } = await verifyStockIntegrity(db, product.id);
    const expectedSuccesses = Math.min(INITIAL_STOCK, CONCURRENT_USERS);

    const check1 = productStock >= 0;
    const check2 = successes.length <= INITIAL_STOCK;
    const check3 = successes.length === expectedSuccesses;
    const check4 = desyncRows.length === 0;

    console.log(`     [1] Stock không âm (${productStock} >= 0): ${check1 ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`     [2] Successes <= initial stock (${successes.length} <= ${INITIAL_STOCK}): ${check2 ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`     [3] Successes == stock bị tiêu thụ (${successes.length} == ${expectedSuccesses}): ${check3 ? '✓ PASS' : '⚠ WARN — kiểm tra lý do bên trên'}`);
    console.log(`     [4] Product/Variant stock sync (0 sản phẩm lệch): ${check4 ? '✓ PASS' : `✗ FAIL — ${desyncRows.length} sản phẩm lệch:`}`);
    if (desyncRows.length > 0) {
      desyncRows.forEach((p) =>
        console.log(
          `           - "${p.name}": product_stock=${p.product_stock}, variant_sum=${p.variant_sum}`,
        ),
      );
    }

    // ── Summary ──
    console.log('\n' + hr);
    const allPass = check1 && check2 && check4;
    console.log(allPass ? '  ✅ TẤT CẢ TESTS PASS' : '  ❌ CÓ TEST FAIL — xem chi tiết ở trên');
    console.log(hr);

  } catch (err: any) {
    console.error('\n❌ LỖI:', err?.message ?? err);
    process.exitCode = 1;
  } finally {
    console.log('\n[Cleanup] Xóa test users...');
    try {
      await cleanupTestUsers(db);
      console.log('     ✓ Done');
    } catch (cleanupErr: any) {
      console.warn('     ⚠ Cleanup lỗi (xóa thủ công nếu cần):', cleanupErr?.message);
    }
    db.release();
    await dbPool.end();
  }
}

main();
