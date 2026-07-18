import 'reflect-metadata';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

import { ProductStockService } from '@/modules/products/product-stock.service';
import { Product } from '@/modules/products/entities/product.entity';
import { Idempotency } from '@/modules/orders/entities/idempotency.entity';
import { IdempotencyStatus } from '@/common/enums';

describe('Checkout concurrency (real Postgres via Testcontainers)', () => {
  let container: StartedPostgreSqlContainer;
  let ds: DataSource;
  const stockSvc = new ProductStockService();

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    ds = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
      synchronize: false,
      entities: [path.join(__dirname, '/../src/**/*.entity{.ts,.js}')],
      migrations: [
        path.join(__dirname, '/../src/database/migrations/*{.ts,.js}'),
      ],
    });
    await ds.initialize();
    await ds.runMigrations(); // schema prod thật (gồm @Check stock >= 0)
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (container) await container.stop();
  });

  it('10 checkout đồng thời trên stock=5 → đúng 5 thành công, stock=0, không âm', async () => {
    const productRepo = ds.getRepository(Product);
    const product = await productRepo.save(
      productRepo.create({
        name: 'Concurrency Product',
        slug: `concurrency-${Date.now()}`,
        price: 100,
        stock_quantity: 5,
        has_variants: false,
      }),
    );

    const CONCURRENCY = 10;
    const attempts = Array.from({ length: CONCURRENCY }, () =>
      ds.transaction((m) =>
        stockSvc.lockAndDeductStockForCheckout(
          [{ product_id: product.id, variant_id: null, quantity: 1 }],
          m,
        ),
      ),
    );
    const results = await Promise.allSettled(attempts);

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    expect(ok).toBe(5);
    expect(failed).toBe(5);

    const reloaded = await productRepo.findOneByOrFail({ id: product.id });
    expect(reloaded.stock_quantity).toBe(0);
    expect(reloaded.stock_quantity).toBeGreaterThanOrEqual(0);
  });

  it('2 insert cùng Idempotency-Key đồng thời → 1 thành công, 1 dính unique (23505)', async () => {
    const key = `dup-key-${Date.now()}`;
    const userId = randomUUID();
    const inserts = [1, 2].map(() =>
      ds.transaction((m) =>
        m.insert(Idempotency, {
          key,
          user_id: userId,
          status: IdempotencyStatus.PENDING,
        }),
      ),
    );
    const res = await Promise.allSettled(inserts);

    const fulfilled = res.filter((r) => r.status === 'fulfilled');
    const rejected = res.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0].reason as { code?: string }).code).toBe('23505');
  });
});
