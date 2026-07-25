import 'reflect-metadata';
import * as path from 'path';
import { DataSource } from 'typeorm';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

import { Product } from '@/modules/products/entities/product.entity';
import { Shop } from '@/modules/shops/entities/shop.entity';
import { User } from '@/modules/users/entities/user.entity';
import { UserRole, AccountStatus, ProductStatus } from '@/common/enums';
import { paginate } from '@/common/helpers/pagination.helper';

/**
 * Test này KHÔNG dựng ProductsService (service có nhiều dependency: shopsService,
 * cloudinary, dataSource...). Nó dựng lại ĐÚNG HÌNH DẠNG query của findAll:
 *   innerJoin shop + where status/is_hidden/shop.status + orderBy + paginate(skip/take)
 * Vì rủi ro cần bắt nằm ở tầng SQL (subquery SELECT DISTINCT khi phân trang có join),
 * không phải ở dây nối service. Phần dây nối kiểm bằng tay ở §4.3.
 */
describe('Sắp xếp sản phẩm — hàng hết xuống cuối (real Postgres via Testcontainers)', () => {
  let container: StartedPostgreSqlContainer;
  let ds: DataSource;

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
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (container) await container.stop();
  });

  /** Dựng 1 shop ACTIVE + các sản phẩm theo mô tả (tên, tồn kho, thứ tự tạo). */
  async function seed(
    items: Array<{ name: string; stock: number }>,
  ): Promise<void> {
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

    const productRepo = ds.getRepository(Product);
    // Lưu tuần tự để created_at tăng dần đúng thứ tự mảng (item cuối là MỚI NHẤT).
    for (const [index, item] of items.entries()) {
      await productRepo.save(
        productRepo.create({
          shop,
          name: item.name,
          slug: `${item.name}-${unique}-${index}`.toLowerCase(),
          price: 100000,
          stock_quantity: item.stock,
          has_variants: false,
          is_hidden: false,
          status: ProductStatus.ACTIVE,
        }),
      );
    }
  }

  /** Dựng lại đúng query của findAll (sort mặc định created_at DESC) rồi phân trang. */
  async function fetchPage(limit = 10) {
    const queryBuilder = ds
      .getRepository(Product)
      .createQueryBuilder('product')
      .innerJoin('product.shop', 'shop');

    queryBuilder.andWhere('product.status = :productStatus', {
      productStatus: ProductStatus.ACTIVE,
    });
    queryBuilder.andWhere('product.is_hidden = :isHidden', { isHidden: false });
    queryBuilder.andWhere('shop.status = :shopStatus', {
      shopStatus: AccountStatus.ACTIVE,
    });

    // ⬇️ ĐÚNG thứ tự đang có trong products.service.ts findAll
    queryBuilder.orderBy('product.is_out_of_stock', 'ASC');
    queryBuilder.addOrderBy('product.created_at', 'DESC');

    return paginate<Product>(queryBuilder, { page: 1, limit } as any);
  }

  it('hàng hết nằm CUỐI dù nó được tạo mới nhất', async () => {
    // "het-hang" tạo SAU CÙNG ⇒ nếu chỉ sort created_at DESC thì nó phải đứng ĐẦU.
    await seed([
      { name: 'con-hang-cu', stock: 5 },
      { name: 'con-hang-moi', stock: 3 },
      { name: 'het-hang', stock: 0 },
    ]);

    const page = await fetchPage();
    const names = page.items.map((p) => p.name);

    // Nếu ORDER BY tồn kho không có tác dụng, 'het-hang' sẽ ở vị trí đầu → đỏ ở đây.
    expect(names[names.length - 1]).toBe('het-hang');
    expect(names.indexOf('con-hang-moi')).toBeLessThan(
      names.indexOf('het-hang'),
    );
  });

  it('trong nhóm còn hàng, thứ tự created_at DESC vẫn giữ nguyên', async () => {
    await seed([
      { name: 'cu-nhat', stock: 5 },
      { name: 'giua', stock: 5 },
      { name: 'moi-nhat', stock: 5 },
    ]);

    const page = await fetchPage();
    const names = page.items.map((p) => p.name);

    expect(names.indexOf('moi-nhat')).toBeLessThan(names.indexOf('giua'));
    expect(names.indexOf('giua')).toBeLessThan(names.indexOf('cu-nhat'));
  });

  it('phân trang vẫn đếm ĐỦ cả hàng hết (không bị lọc mất)', async () => {
    await seed([
      { name: 'a', stock: 1 },
      { name: 'b', stock: 0 },
      { name: 'c', stock: 0 },
    ]);

    const page = await fetchPage(2);

    // 3 sản phẩm vẫn được đếm — chỉ đổi thứ tự, KHÔNG ẩn.
    expect(page.meta.totalItems).toBeGreaterThanOrEqual(3);
    expect(page.items.length).toBe(2);
  });
});
