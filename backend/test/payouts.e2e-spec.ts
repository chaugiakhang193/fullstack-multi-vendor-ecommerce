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
import { Order } from '@/modules/orders/entities/order.entity';
import { SubOrder } from '@/modules/orders/entities/sub-order.entity';
import { Payout } from '@/modules/payouts/entities/payout.entity';
import { UserRole, AccountStatus, OrderStatus, PayoutStatus } from '@/common/enums';

jest.setTimeout(60000);

describe('Payouts E2E', () => {
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
  let customerUser: User;

  // Shops
  let shopA: Shop;
  let shopB: Shop;

  const createdEmails = [
    'e2e-po-sellerA@example.com',
    'e2e-po-sellerB@example.com',
    'e2e-po-admin@example.com',
    'e2e-po-customer@example.com',
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
    await dataSource.getRepository(Payout).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(SubOrder).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(Order).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(Shop).delete({ id: Not(IsNull()) });
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

    sellerA = await mkUser('e2epoSellerA', createdEmails[0], UserRole.SELLER);
    sellerB = await mkUser('e2epoSellerB', createdEmails[1], UserRole.SELLER);
    adminUser = await mkUser('e2epoAdmin', createdEmails[2], UserRole.ADMIN);
    customerUser = await mkUser('e2epoCustomer', createdEmails[3], UserRole.CUSTOMER);

    sellerAToken = await signToken(sellerA);
    sellerBToken = await signToken(sellerB);
    adminToken = await signToken(adminUser);

    const shopRepo = dataSource.getRepository(Shop);
    
    // shopA đã setup tài khoản ngân hàng
    shopA = await shopRepo.save(
      shopRepo.create({
        seller: sellerA,
        name: 'E2E PO Shop A',
        status: AccountStatus.ACTIVE,
        bank_account_info: {
          bank_name: 'Vietcombank',
          account_number: '123456789',
          account_holder: 'SHOP SELLER A',
        },
      }),
    );

    // shopB chưa setup tài khoản ngân hàng (null)
    shopB = await shopRepo.save(
      shopRepo.create({
        seller: sellerB,
        name: 'E2E PO Shop B',
        status: AccountStatus.ACTIVE,
        bank_account_info: null,
      }),
    );

    // Seed revenue cho shopA
    const orderRepo = dataSource.getRepository(Order);
    const subRepo = dataSource.getRepository(SubOrder);

    const orderNumberStr = `#E2EPO-${crypto.randomUUID().slice(0, 8)}`;
    const totalAmt = 1000000;
    const subTotalAmt = 1000000;

    const order = await orderRepo.save(
      orderRepo.create({
        customer: customerUser,
        total_amount: totalAmt,
        status: OrderStatus.DELIVERED,
        order_number: orderNumberStr,
      }),
    );

    const deliveredStatus = OrderStatus.DELIVERED;
    const zeroFee = 0;

    await subRepo.save(
      subRepo.create({
        shop: shopA,
        order: order,
        sub_total: subTotalAmt,
        shipping_fee: zeroFee,
        status: deliveredStatus,
      }),
    );

    // Seed revenue cho shopB
    const orderNumberStrB = `#E2EPO-${crypto.randomUUID().slice(0, 8)}`;
    const orderB = await orderRepo.save(
      orderRepo.create({
        customer: customerUser,
        total_amount: totalAmt,
        status: OrderStatus.DELIVERED,
        order_number: orderNumberStrB,
      }),
    );

    await subRepo.save(
      subRepo.create({
        shop: shopB,
        order: orderB,
        sub_total: subTotalAmt,
        shipping_fee: zeroFee,
        status: deliveredStatus,
      }),
    );
  });

  afterAll(async () => {
    await wipe();
    await app.close();
  });

  describe('Payout invariants & boundaries', () => {
    it('B1: Rút tiền khi chưa cấu hình bank_account_info -> 400', async () => {
      const authHeader = `Bearer ${sellerBToken}`;
      const amountVal = 100000;
      const payload = { amount: amountVal };
      const payoutRoute = '/seller/payouts';

      const res = await request(app.getHttpServer())
        .post(payoutRoute)
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('Vui lòng cập nhật thông tin tài khoản ngân hàng');
    });

    let createdPayoutId: string;

    it('B2: Rút tiền hợp lệ -> 201 và snapshot thông tin ngân hàng đúng', async () => {
      const authHeader = `Bearer ${sellerAToken}`;
      const amountVal = 100000;
      const payload = { amount: amountVal };
      const payoutRoute = '/seller/payouts';

      const res = await request(app.getHttpServer())
        .post(payoutRoute)
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data.amount).toBe(amountVal);
      expect(res.body.data.status).toBe(PayoutStatus.PENDING);
      expect(res.body.data.bank_info_snapshot).toEqual({
        bank_name: 'Vietcombank',
        account_number: '123456789',
        account_holder: 'SHOP SELLER A',
      });

      createdPayoutId = res.body.data.id;
    });

    it('B3: Immutability of snapshot -> đổi bank của shop, snapshot của payout cũ không đổi', async () => {
      // Đổi thông tin ngân hàng của shopA
      const shopRepo = dataSource.getRepository(Shop);
      const shop = await shopRepo.findOne({
        where: { id: shopA.id },
      });
      shop.bank_account_info = {
        bank_name: 'Techcombank',
        account_number: '999999999',
        account_holder: 'SHOP SELLER A NEW',
      };
      await shopRepo.save(shop);

      // Query database kiểm tra payout cũ
      const payoutRepo = dataSource.getRepository(Payout);
      const dbPayout = await payoutRepo.findOne({
        where: { id: createdPayoutId },
      });

      // Snapshot của payout vẫn phải là Vietcombank cũ
      expect(dbPayout.bank_info_snapshot).toEqual({
        bank_name: 'Vietcombank',
        account_number: '123456789',
        account_holder: 'SHOP SELLER A',
      });
    });

    it('B4: Rút tiền dưới mức tối thiểu (50.000) -> 400', async () => {
      const authHeader = `Bearer ${sellerAToken}`;
      const amountVal = 40000;
      const payload = { amount: amountVal };
      const payoutRoute = '/seller/payouts';

      const res = await request(app.getHttpServer())
        .post(payoutRoute)
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(400);
    });

    it('B5: Rút tiền vượt quá số dư khả dụng -> 400', async () => {
      // Xoá payout pending cũ để tránh bị chặn bởi guard trùng lệnh
      await dataSource.getRepository(Payout).delete({ id: Not(IsNull()) });

      const authHeader = `Bearer ${sellerAToken}`;
      const amountVal = 2000000; // Doanh thu là 1.000.000 (sau phí hoa hồng còn ít hơn 1M)
      const payload = { amount: amountVal };
      const payoutRoute = '/seller/payouts';

      const res = await request(app.getHttpServer())
        .post(payoutRoute)
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('Số dư khả dụng không đủ');
    });

    it('B6: Chặn tạo yêu cầu rút tiền mới khi đang có lệnh PENDING/PROCESSING -> 400', async () => {
      const authHeader = `Bearer ${sellerAToken}`;
      const amountVal = 50000;
      const payload = { amount: amountVal };
      const payoutRoute = '/seller/payouts';

      // Tạo lệnh pending đầu tiên
      await request(app.getHttpServer())
        .post(payoutRoute)
        .set('Authorization', authHeader)
        .send(payload);

      // Gửi lần 2 trong khi lệnh trên vẫn đang PENDING
      const res = await request(app.getHttpServer())
        .post(payoutRoute)
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('đang có một yêu cầu rút tiền đang được xử lý');
    });
  });

  describe('Admin audit & state machine & IDOR', () => {
    let secondPayoutId: string;

    beforeAll(async () => {
      // Trước tiên, approve hoặc reject payout cũ để xóa block pending payout
      const payoutRepo = dataSource.getRepository(Payout);
      await payoutRepo.delete({ id: Not(IsNull()) });

      // Tạo 1 payout PENDING mới cho shopA
      const payout = payoutRepo.create({
        shop: shopA,
        amount: 80000,
        status: PayoutStatus.PENDING,
        bank_info_snapshot: {
          bank_name: 'Vietcombank',
          account_number: '123456789',
          account_holder: 'SHOP SELLER A',
        },
      });
      const saved = await payoutRepo.save(payout);
      secondPayoutId = saved.id;
    });

    it('B7: Admin approve payout -> audit resolved_by được set đúng', async () => {
      const authHeader = `Bearer ${adminToken}`;
      const approveRoute = `/admin/payouts/${secondPayoutId}/approve`;

      const res = await request(app.getHttpServer())
        .patch(approveRoute)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(PayoutStatus.COMPLETED);

      // Verify DB audit
      const payoutRepo = dataSource.getRepository(Payout);
      const dbPayout = await payoutRepo.findOne({
        where: { id: secondPayoutId },
        relations: ['resolved_by'],
      });

      expect(dbPayout.resolved_by).toBeDefined();
      expect(dbPayout.resolved_by.id).toBe(adminUser.id); // Check resolved_by trỏ đúng admin
      expect(dbPayout.resolved_at).not.toBeNull();
    });

    it('B8: Admin reject payout -> status = rejected, có reject_reason', async () => {
      // Tạo 1 payout PENDING mới
      const payoutRepo = dataSource.getRepository(Payout);
      const payout = await payoutRepo.save(
        payoutRepo.create({
          shop: shopA,
          amount: 60000,
          status: PayoutStatus.PENDING,
          bank_info_snapshot: {
            bank_name: 'Vietcombank',
            account_number: '123456789',
            account_holder: 'SHOP SELLER A',
          },
        }),
      );

      const authHeader = `Bearer ${adminToken}`;
      const rejectRoute = `/admin/payouts/${payout.id}/reject`;
      const rejectReasonStr = 'Chủ tài khoản không khớp';
      const payload = { reason: rejectReasonStr };

      const res = await request(app.getHttpServer())
        .patch(rejectRoute)
        .set('Authorization', authHeader)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(PayoutStatus.REJECTED);
      expect(res.body.data.reject_reason).toBe(rejectReasonStr);

      const dbPayout = await payoutRepo.findOne({
        where: { id: payout.id },
        relations: ['resolved_by'],
      });
      expect(dbPayout.resolved_by.id).toBe(adminUser.id);
    });

    it('B9: Lệnh đã xử lý không thể xử lý lại -> 400', async () => {
      const authHeader = `Bearer ${adminToken}`;
      const approveRoute = `/admin/payouts/${secondPayoutId}/approve`; // payout này đã completed ở B7

      const res = await request(app.getHttpServer())
        .patch(approveRoute)
        .set('Authorization', authHeader);

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('đã được xử lý từ trước');
    });

    it('B10: IDOR Check -> Seller A chỉ thấy lịch sử rút tiền của mình, không thấy của người khác', async () => {
      // Tạo payout cho shop B
      const payoutRepo = dataSource.getRepository(Payout);
      await payoutRepo.save(
        payoutRepo.create({
          shop: shopB,
          amount: 120000,
          status: PayoutStatus.COMPLETED,
          bank_info_snapshot: {
            bank_name: 'Vietcombank',
            account_number: '987',
            account_holder: 'SHOP SELLER B',
          },
        }),
      );

      const authHeader = `Bearer ${sellerAToken}`;
      const historyRoute = '/seller/payouts/history';

      const res = await request(app.getHttpServer())
        .get(historyRoute)
        .set('Authorization', authHeader);

      expect(res.status).toBe(200);
      // Kết quả chỉ được chứa payout của shopA
      const dataItems = res.body.data.items || [];
      const hasOtherShopPayout = dataItems.some((item: any) => item.shop?.id === shopB.id);
      expect(hasOtherShopPayout).toBe(false);
    });

    it('B11: Phân quyền -> Seller gọi API admin approve -> 403', async () => {
      const authHeader = `Bearer ${sellerAToken}`;
      const approveRoute = `/admin/payouts/${secondPayoutId}/approve`;

      const res = await request(app.getHttpServer())
        .patch(approveRoute)
        .set('Authorization', authHeader);

      expect(res.status).toBe(403);
    });
  });
});
