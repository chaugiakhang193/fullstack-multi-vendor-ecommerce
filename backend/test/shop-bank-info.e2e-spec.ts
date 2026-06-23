import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Not, IsNull } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

import { AppModule } from './../src/app.module';
import { CloudinaryService } from '@/modules/cloudinary/cloudinary.service';
import { ACCESS_TOKEN_SERVICE } from '@/auth/auth.constants';
import { hashDataHelper } from '@/common/helpers/utils';

import { User } from '@/modules/users/entities/user.entity';
import { Shop } from '@/modules/shops/entities/shop.entity';
import { Category } from '@/modules/products/entities/category.entity';
import { UserRole, AccountStatus } from '@/common/enums';

jest.setTimeout(60000);

describe('Shop Bank Info (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtService: JwtService;

  // Users + tokens
  let sellerA: User;
  let sellerAToken: string;
  let sellerB: User;
  let sellerBToken: string;
  let adminUser: User;
  let adminToken: string;

  // Data
  let rootCategory: Category;

  const createdEmails = [
    'e2e-sbi-sellerA@example.com',
    'e2e-sbi-sellerB@example.com',
    'e2e-sbi-admin@example.com',
  ];

  const mockCloudinaryService = {
    uploadFile: jest.fn().mockResolvedValue({
      id: crypto.randomUUID(),
      public_id: 'mock',
      url: 'https://mock/x.jpg',
    }),
    findAssetByUrl: jest.fn().mockResolvedValue({ id: crypto.randomUUID() }),
    deleteFile: jest.fn().mockResolvedValue(true),
    deleteAsset: jest.fn().mockResolvedValue(true),
    updateAssetShopId: jest.fn().mockResolvedValue(true),
  };

  async function wipe(): Promise<void> {
    await dataSource.getRepository(Shop).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(Category).delete({ slug: 'e2e-sbi-category' });
    for (const email of createdEmails) {
      await dataSource.getRepository(User).delete({ email });
    }
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CloudinaryService)
      .useValue(mockCloudinaryService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    jwtService = moduleFixture.get<JwtService>(ACCESS_TOKEN_SERVICE);

    await wipe();

    const userRepo = dataSource.getRepository(User);
    const pwd = await hashDataHelper('Password123!');

    const mkUser = async (
      username: string,
      email: string,
      role: UserRole,
    ): Promise<User> => {
      const u = userRepo.create({
        username,
        email,
        password: pwd,
        role,
        status: AccountStatus.ACTIVE,
        full_name: username,
      });
      return userRepo.save(u);
    };

    const signToken = (u: User) => {
      const payload = {
        sub: u.id,
        username: u.username,
        role: u.role,
        status: u.status,
      };
      return jwtService.signAsync(payload);
    };

    // Tạo các users
    sellerA = await mkUser('e2esbiSellerA', createdEmails[0], UserRole.SELLER);
    sellerB = await mkUser('e2esbiSellerB', createdEmails[1], UserRole.SELLER);
    adminUser = await mkUser('e2esbiAdmin', createdEmails[2], UserRole.ADMIN);

    sellerAToken = await signToken(sellerA);
    sellerBToken = await signToken(sellerB);
    adminToken = await signToken(adminUser);

    // Tạo 1 root category gốc phục vụ setup shop
    const categoryRepo = dataSource.getRepository(Category);
    rootCategory = await categoryRepo.save(
      categoryRepo.create({
        name: 'E2E SBI Category',
        slug: 'e2e-sbi-category',
      }),
    );
  });

  afterAll(async () => {
    await wipe();
    await app.close();
  });

  describe('Multipart Setup & JSONB persistence & Validation', () => {
    it('A1: Setup shop hợp lệ với bank_account_info dạng stringified JSON -> DB lưu jsonb', async () => {
      const authHeader = `Bearer ${sellerAToken}`;
      const logoBuf = Buffer.from('logo');
      const bannerBuf = Buffer.from('banner');
      const galleryBuf = Buffer.from('gallery');

      const bankInfoData = {
        bank_name: 'Techcombank',
        account_number: '190345678910',
        account_holder: 'NGUYEN VAN A',
      };
      const bankInfoStr = JSON.stringify(bankInfoData);

      const setupRoute = '/seller/shops/setup';

      const res = await request(app.getHttpServer())
        .post(setupRoute)
        .set('Authorization', authHeader)
        .field('name', 'Shop Seller A')
        .field('pickup_address', '123 E2E Street, Hanoi')
        .field('categoryIds[]', rootCategory.id)
        .field('bank_account_info', bankInfoStr)
        .attach('logo', logoBuf, 'logo.png')
        .attach('banner', bannerBuf, 'banner.png')
        .attach('gallery', galleryBuf, 'g1.png');

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Shop Seller A');

      // Query database kiểm tra cột bank_account_info
      const shopRepo = dataSource.getRepository(Shop);
      const dbShop = await shopRepo.findOne({
        where: { id: res.body.data.id },
      });

      expect(dbShop).toBeDefined();
      expect(dbShop.bank_account_info).toEqual({
        bank_name: 'Techcombank',
        account_number: '190345678910',
        account_holder: 'NGUYEN VAN A',
      });
    });

    it('A2: Setup thiếu account_number -> Validation báo lỗi 400', async () => {
      const authHeader = `Bearer ${sellerBToken}`;
      const logoBuf = Buffer.from('logo');
      const bannerBuf = Buffer.from('banner');
      const galleryBuf = Buffer.from('gallery');

      // Thiếu account_number
      const bankInfoData = {
        bank_name: 'Techcombank',
        account_holder: 'NGUYEN VAN B',
      };
      const bankInfoStr = JSON.stringify(bankInfoData);
      const setupRoute = '/seller/shops/setup';

      const res = await request(app.getHttpServer())
        .post(setupRoute)
        .set('Authorization', authHeader)
        .field('name', 'Shop Seller B')
        .field('pickup_address', '456 E2E Street, Hanoi')
        .field('categoryIds[]', rootCategory.id)
        .field('bank_account_info', bankInfoStr)
        .attach('logo', logoBuf, 'logo.png')
        .attach('banner', bannerBuf, 'banner.png')
        .attach('gallery', galleryBuf, 'g1.png');

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('Số tài khoản không được để trống');
    });

    it('A3: Setup gửi JSON string hỏng -> Validation báo lỗi 400', async () => {
      const authHeader = `Bearer ${sellerBToken}`;
      const logoBuf = Buffer.from('logo');
      const bannerBuf = Buffer.from('banner');
      const galleryBuf = Buffer.from('gallery');

      const bankInfoStr = '{bad json';
      const setupRoute = '/seller/shops/setup';

      const res = await request(app.getHttpServer())
        .post(setupRoute)
        .set('Authorization', authHeader)
        .field('name', 'Shop Seller B')
        .field('pickup_address', '456 E2E Street, Hanoi')
        .field('categoryIds[]', rootCategory.id)
        .field('bank_account_info', bankInfoStr)
        .attach('logo', logoBuf, 'logo.png')
        .attach('banner', bannerBuf, 'banner.png')
        .attach('gallery', galleryBuf, 'g1.png');

      expect(res.status).toBe(400);
    });
  });

  describe('Security and Information Leakage Checks', () => {
    let createdShopId: string;

    beforeAll(async () => {
      // Setup shopA qua DB trực tiếp và đặt trạng thái ACTIVE
      const shopRepo = dataSource.getRepository(Shop);
      const existingShop = await shopRepo.findOne({
        where: { seller: { id: sellerA.id } },
      });
      existingShop.status = AccountStatus.ACTIVE;
      const saved = await shopRepo.save(existingShop);
      createdShopId = saved.id;
    });

    it('A4: Khách xem public -> 200, nhưng bank_account_info bị ẩn', async () => {
      const publicRoute = `/shops/${createdShopId}`;
      const res = await request(app.getHttpServer()).get(publicRoute);

      expect(res.status).toBe(200);
      // bank_account_info phải hoàn toàn biến mất hoặc null
      expect(res.body.data.bank_account_info).toBeNull();
    });

    it('A5: Seller xem shop của mình -> Có đầy đủ bank_account_info', async () => {
      const authHeader = `Bearer ${sellerAToken}`;
      const sellerGetRoute = '/seller/shops';
      const res = await request(app.getHttpServer())
        .get(sellerGetRoute)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.data.bank_account_info).toEqual({
        bank_name: 'Techcombank',
        account_number: '190345678910',
        account_holder: 'NGUYEN VAN A',
      });
    });

    it('A6: Admin xem shop -> Có đầy đủ bank_account_info', async () => {
      const authHeader = `Bearer ${adminToken}`;
      const adminGetRoute = `/admin/shops/${createdShopId}`;
      const res = await request(app.getHttpServer())
        .get(adminGetRoute)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.data.bank_account_info).toEqual({
        bank_name: 'Techcombank',
        account_number: '190345678910',
        account_holder: 'NGUYEN VAN A',
      });
    });
  });

  describe('Update Shop (PATCH)', () => {
    it('A7: Seller PATCH cập nhật thông tin ngân hàng -> DB cập nhật và validate nested', async () => {
      const authHeader = `Bearer ${sellerAToken}`;
      const updateRoute = '/seller/shops';

      const updateData = {
        bank_name: 'Vietcombank',
        account_number: '987654321',
        account_holder: 'NGUYEN VAN A UPDATE',
      };
      const updateStr = JSON.stringify(updateData);

      const res = await request(app.getHttpServer())
        .patch(updateRoute)
        .set('Authorization', authHeader)
        .field('bank_account_info', updateStr);

      expect(res.status).toBe(200);

      // Verify in DB
      const shopRepo = dataSource.getRepository(Shop);
      const dbShop = await shopRepo.findOne({
        where: { seller: { id: sellerA.id } },
      });

      expect(dbShop.bank_account_info).toEqual({
        bank_name: 'Vietcombank',
        account_number: '987654321',
        account_holder: 'NGUYEN VAN A UPDATE',
      });
    });
  });
});
