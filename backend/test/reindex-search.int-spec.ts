import 'reflect-metadata';
import * as path from 'path';
import { DataSource } from 'typeorm';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

import { ProductsService } from '@/modules/products/products.service';
import { Product } from '@/modules/products/entities/product.entity';
import { Shop } from '@/modules/shops/entities/shop.entity';
import { User } from '@/modules/users/entities/user.entity';
import { OutboxEvent } from '@/common/entities/outbox-event.entity';
import { UserRole, AccountStatus, ProductStatus } from '@/common/enums';
import { ProductSearchSnapshotPayload } from '@/common/constants/outbox.constants';

/**
 * Verify part3: reindexSearchIndex re-emit outbox `product.updated` cho ĐÚNG tập
 * product `status != DELETED` (ACTIVE + SUSPENDED + hidden), payload đúng, count đúng,
 * và mỗi lần chạy sinh event_id MỚI (re-run tạo row mới, không tái dùng id).
 *
 * Dựng ProductsService THẬT nhưng chỉ nạp productsRepository + dataSource (2 dep duy
 * nhất mà reindexSearchIndex/emitProductSnapshot chạm tới); các dep còn lại là stub vì
 * đường code này không gọi tới chúng. Không cần RabbitMQ — chỉ kiểm tầng ghi outbox.
 */
describe('reindexSearchIndex — backfill outbox (real Postgres via Testcontainers)', () => {
  let container: StartedPostgreSqlContainer;
  let ds: DataSource;
  let service: ProductsService;

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
    await ds.runMigrations();

    const stub = {} as any;
    service = new ProductsService(
      ds.getRepository(Product),
      stub, // categoriesService
      stub, // cloudinaryService
      stub, // shopsService
      ds,
      stub, // searchClient
      stub, // searchWarmup
    );
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (container) await container.stop();
  });

  // Ids seed (điền trong beforeAll của describe con), dùng chung giữa các test.
  let shopId: string;
  let idActive: string;
  let idHidden: string;
  let idSuspended: string;
  let idDeleted: string;

  beforeAll(async () => {
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const seller = await ds.getRepository(User).save(
      ds.getRepository(User).create({
        username: `seller-${unique}`,
        email: `seller-${unique}@test.local`,
        role: UserRole.SELLER,
        status: AccountStatus.ACTIVE,
      }),
    );

    const shop = await ds.getRepository(Shop).save(
      ds.getRepository(Shop).create({
        seller,
        name: `Shop ${unique}`,
        status: AccountStatus.ACTIVE,
      }),
    );
    shopId = shop.id;

    const productRepo = ds.getRepository(Product);
    const mk = async (
      name: string,
      status: ProductStatus,
      isHidden: boolean,
    ): Promise<string> => {
      const p = await productRepo.save(
        productRepo.create({
          shop,
          name,
          slug: `${name}-${unique}`.toLowerCase(),
          price: 100000,
          stock_quantity: 5,
          has_variants: false,
          is_hidden: isHidden,
          status,
        }),
      );
      return p.id;
    };

    idActive = await mk('sp-active', ProductStatus.ACTIVE, false);
    idHidden = await mk('sp-hidden', ProductStatus.ACTIVE, true);
    idSuspended = await mk('sp-suspended', ProductStatus.SUSPENDED, false);
    idDeleted = await mk('sp-deleted', ProductStatus.DELETED, false);
  });

  /** Đọc mọi outbox row product.updated + payload đã parse. */
  async function readSnapshotEvents(): Promise<
    Array<{ id: string; payload: ProductSearchSnapshotPayload }>
  > {
    const rows = await ds
      .getRepository(OutboxEvent)
      .find({ order: { created_at: 'ASC' } });
    return rows
      .filter((r) => r.event_type === 'product.updated')
      .map((r) => ({
        id: r.id,
        payload: r.payload as ProductSearchSnapshotPayload,
      }));
  }

  it('emit đúng tập status != DELETED (ACTIVE + SUSPENDED + hidden), bỏ DELETED', async () => {
    const result = await service.reindexSearchIndex();

    // 3 product không-xoá (active + hidden + suspended); deleted bị loại.
    expect(result.queued).toBe(3);

    const events = await readSnapshotEvents();
    expect(events.length).toBe(3);

    const emittedIds = events.map((e) => e.payload.productId).sort();
    expect(emittedIds).toEqual([idActive, idHidden, idSuspended].sort());
    expect(emittedIds).not.toContain(idDeleted);
  });

  it('payload đúng: shopId từ relation, isHidden/status giữ nguyên, price chuẩn hoá 2 số', async () => {
    const events = await readSnapshotEvents();
    const byId = new Map(events.map((e) => [e.payload.productId, e.payload]));

    const active = byId.get(idActive)!;
    expect(active.shopId).toBe(shopId); // relation shop được load
    expect(active.isHidden).toBe(false);
    expect(active.status).toBe(ProductStatus.ACTIVE);
    expect(active.price).toBe('100000.00'); // numeric(12,2) chuẩn hoá 2 chữ số
    expect(active.categoryId).toBeNull(); // seed không gắn category

    expect(byId.get(idHidden)!.isHidden).toBe(true); // hidden VẪN vào index
    expect(byId.get(idSuspended)!.status).toBe(ProductStatus.SUSPENDED);
  });

  it('re-run sinh event_id MỚI (không tái dùng id) — nền cho dedup/guard idempotent', async () => {
    const before = await readSnapshotEvents();
    const idsBefore = new Set(before.map((e) => e.id));

    const result = await service.reindexSearchIndex();
    expect(result.queued).toBe(3);

    const after = await readSnapshotEvents();
    // Tổng gấp đôi: 3 event mới cộng vào 3 cũ.
    expect(after.length).toBe(before.length + 3);
    // Mọi id đều phân biệt — 3 event lần 2 KHÔNG trùng id lần 1.
    const allIds = new Set(after.map((e) => e.id));
    expect(allIds.size).toBe(after.length);
    // 3 id cũ vẫn còn nguyên trong tập.
    for (const id of idsBefore) {
      expect(allIds.has(id)).toBe(true);
    }
  });
});
