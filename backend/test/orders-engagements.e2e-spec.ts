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
import { Address } from '@/modules/users/entities/address.entity';
import { Category } from '@/modules/products/entities/category.entity';
import { Product } from '@/modules/products/entities/product.entity';
import { ProductVariant } from '@/modules/products/entities/product-variant.entity';
import { CartItem } from '@/modules/carts/entities/cart-item.entity';
import { Coupon } from '@/modules/promotions/entities/coupon.entity';
import { Order } from '@/modules/orders/entities/order.entity';
import { SubOrder } from '@/modules/orders/entities/sub-order.entity';
import { OrderItem } from '@/modules/orders/entities/order-item.entity';
import { Notification } from '@/modules/engagements/entities/notification.entity';

import {
  UserRole,
  AccountStatus,
  OrderStatus,
  CouponType,
  DiscountType,
  NotificationType,
  ProductStatus,
} from '@/common/enums';

/**
 * E2E cho Phase B (Checkout Preview) + Phase C (Notifications) + state machine
 * của Seller Orders (Phase A). Tập trung vào các INVARIANT mà FE E2E happy-path
 * KHÔNG bắt được: no-write của preview, IDOR, state machine chặn nhảy cóc.
 */
jest.setTimeout(60000);

describe('Orders & Engagements (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtService: JwtService;

  // Users + tokens
  let sellerA: User;
  let sellerAToken: string;
  let sellerB: User;
  let shopA: Shop;
  let shopB: Shop;

  let orderCustomer: User;
  let orderCustomerToken: string;
  let orderCustomerAddress: Address;

  let emptyCustomer: User;
  let emptyCustomerToken: string;

  let notifUserA: User;
  let notifUserAToken: string;
  let notifUserB: User;

  // Data
  let category: Category;
  let productA: Product;
  let shopCoupon: Coupon;
  let subOrderA: SubOrder; // thuộc shopA — dùng cho state machine
  let subOrderB: SubOrder; // thuộc shopB — dùng cho IDOR
  let notifUnreadId1: string;
  let notifUserBId: string;

  const createdEmails = [
    'e2e-oe-sellerA@example.com',
    'e2e-oe-sellerB@example.com',
    'e2e-oe-order-customer@example.com',
    'e2e-oe-empty-customer@example.com',
    'e2e-oe-notif-a@example.com',
    'e2e-oe-notif-b@example.com',
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
  };

  async function wipe(): Promise<void> {
    await dataSource.getRepository(OrderItem).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(SubOrder).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(Order).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(CartItem).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(Notification).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(Coupon).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(ProductVariant).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(Product).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(Address).delete({ id: Not(IsNull()) });
    await dataSource.getRepository(Shop).delete({ id: Not(IsNull()) });
    await dataSource
      .getRepository(Category)
      .delete({ slug: 'e2e-oe-category' });
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

    const signToken = (u: User) =>
      jwtService.signAsync({
        sub: u.id,
        username: u.username,
        role: u.role,
        status: u.status,
      });

    // Users
    sellerA = await mkUser('e2eoeSellerA', createdEmails[0], UserRole.SELLER);
    sellerB = await mkUser('e2eoeSellerB', createdEmails[1], UserRole.SELLER);
    orderCustomer = await mkUser(
      'e2eoeOrderCust',
      createdEmails[2],
      UserRole.CUSTOMER,
    );
    emptyCustomer = await mkUser(
      'e2eoeEmptyCust',
      createdEmails[3],
      UserRole.CUSTOMER,
    );
    notifUserA = await mkUser('e2eoeNotifA', createdEmails[4], UserRole.CUSTOMER);
    notifUserB = await mkUser('e2eoeNotifB', createdEmails[5], UserRole.CUSTOMER);

    sellerAToken = await signToken(sellerA);
    orderCustomerToken = await signToken(orderCustomer);
    emptyCustomerToken = await signToken(emptyCustomer);
    notifUserAToken = await signToken(notifUserA);

    // Shops (ACTIVE + toạ độ verified để shipping calculator chạy được)
    const shopRepo = dataSource.getRepository(Shop);
    shopA = await shopRepo.save(
      shopRepo.create({
        seller: sellerA,
        name: 'E2E Shop A',
        status: AccountStatus.ACTIVE,
        lat: '10.762622',
        lng: '106.660172',
        is_coordinates_verified: true,
      }),
    );
    shopB = await shopRepo.save(
      shopRepo.create({
        seller: sellerB,
        name: 'E2E Shop B',
        status: AccountStatus.ACTIVE,
        lat: '10.762622',
        lng: '106.660172',
        is_coordinates_verified: true,
      }),
    );

    // Category + Product (shopA, kho = 3 để test stock_warning "Chỉ còn 3")
    category = await dataSource.getRepository(Category).save(
      dataSource
        .getRepository(Category)
        .create({ name: 'E2E OE Category', slug: 'e2e-oe-category' }),
    );
    productA = await dataSource.getRepository(Product).save(
      dataSource.getRepository(Product).create({
        shop: shopA,
        name: 'E2E Preview Product',
        slug: 'e2e-preview-product',
        price: 100000,
        stock_quantity: 3,
        category,
        status: ProductStatus.ACTIVE,
        thumbnail_url: 'https://mock/thumb.jpg',
      }),
    );

    // Address của orderCustomer (cùng toạ độ shop)
    orderCustomerAddress = await dataSource.getRepository(Address).save(
      dataSource.getRepository(Address).create({
        user: orderCustomer,
        address_line: '123 E2E Street',
        lat: '10.762622',
        lng: '106.660172',
        recipient_name: 'Order Customer',
        phone: '0900000000',
        is_default: true,
      }),
    );
    // emptyCustomer cũng cần address hợp lệ để qua bước findOwnedAddressOrFail
    const emptyAddress = await dataSource.getRepository(Address).save(
      dataSource.getRepository(Address).create({
        user: emptyCustomer,
        address_line: '456 Empty Street',
        lat: '10.762622',
        lng: '106.660172',
        recipient_name: 'Empty Customer',
        phone: '0900000001',
        is_default: true,
      }),
    );
    (emptyCustomer as any)._addressId = emptyAddress.id;

    // Coupon SHOP cho shopA (no-write test: used_count phải GIỮ NGUYÊN sau preview)
    shopCoupon = await dataSource.getRepository(Coupon).save(
      dataSource.getRepository(Coupon).create({
        code: 'E2E-OE-SHOP10',
        type: CouponType.SHOP,
        shop: shopA,
        discount_type: DiscountType.FIXED_AMOUNT,
        discount_value: 10000,
        usage_limit: 100,
        used_count: 0,
      }),
    );

    // Cart cho orderCustomer: productA × 2 (subtotal 200k)
    await dataSource.getRepository(CartItem).save(
      dataSource
        .getRepository(CartItem)
        .create({ user: orderCustomer, product: productA, quantity: 2 }),
    );

    // Seed Order/SubOrder cho state machine (shopA) + IDOR (shopB)
    const orderRepo = dataSource.getRepository(Order);
    const subRepo = dataSource.getRepository(SubOrder);
    const itemRepo = dataSource.getRepository(OrderItem);

    const orderA = await orderRepo.save(
      orderRepo.create({
        customer: orderCustomer,
        total_amount: 200000,
        status: OrderStatus.PENDING,
        order_number: `#E2E-${crypto.randomUUID().slice(0, 8)}`,
      }),
    );
    subOrderA = await subRepo.save(
      subRepo.create({
        shop: shopA,
        order: orderA,
        sub_total: 200000,
        shipping_fee: 0,
        status: OrderStatus.PENDING,
      }),
    );
    await itemRepo.save(
      itemRepo.create({
        sub_order: subOrderA,
        product: productA,
        quantity: 2,
        price_at_purchase: 100000,
        product_name: productA.name,
      }),
    );

    const orderB = await orderRepo.save(
      orderRepo.create({
        customer: orderCustomer,
        total_amount: 100000,
        status: OrderStatus.PENDING,
        order_number: `#E2E-${crypto.randomUUID().slice(0, 8)}`,
      }),
    );
    subOrderB = await subRepo.save(
      subRepo.create({
        shop: shopB,
        order: orderB,
        sub_total: 100000,
        shipping_fee: 0,
        status: OrderStatus.PENDING,
      }),
    );

    // Notifications: notifUserA (2 unread + 1 read), notifUserB (1 unread)
    const notifRepo = dataSource.getRepository(Notification);
    const n1 = await notifRepo.save(
      notifRepo.create({
        user: notifUserA,
        type: NotificationType.ORDER_CREATED,
        title: 'Unread 1',
        content: 'x',
        is_read: false,
      }),
    );
    notifUnreadId1 = n1.id;
    await notifRepo.save(
      notifRepo.create({
        user: notifUserA,
        type: NotificationType.ORDER_CREATED,
        title: 'Unread 2',
        content: 'x',
        is_read: false,
      }),
    );
    await notifRepo.save(
      notifRepo.create({
        user: notifUserA,
        type: NotificationType.ORDER_CREATED,
        title: 'Read 1',
        content: 'x',
        is_read: true,
      }),
    );
    const nb = await notifRepo.save(
      notifRepo.create({
        user: notifUserB,
        type: NotificationType.ORDER_CREATED,
        title: 'Belongs to B',
        content: 'x',
        is_read: false,
      }),
    );
    notifUserBId = nb.id;
  });

  afterAll(async () => {
    if (dataSource) {
      await wipe();
      await dataSource.destroy();
    }
    if (app) {
      await app.close();
    }
  });

  // ==========================================
  // PHASE B — CHECKOUT PREVIEW (no-write)
  // ==========================================
  describe('POST /orders/checkout/preview', () => {
    it('trả về breakdown đúng + stock_warning + KHÔNG ghi DB (no-write)', async () => {
      const orderCountBefore = await dataSource.getRepository(Order).count();

      const res = await request(app.getHttpServer())
        .post('/orders/checkout/preview')
        .set('Authorization', `Bearer ${orderCustomerToken}`)
        .send({
          address_id: orderCustomerAddress.id,
          shop_coupons: [{ shop_id: shopA.id, coupon_code: shopCoupon.code }],
        });

      if (res.status !== 200) {
        // eslint-disable-next-line no-console
        console.log('PREVIEW FAILED:', res.status, JSON.stringify(res.body));
      }
      expect(res.status).toBe(200);

      const data = res.body.data;
      expect(Array.isArray(data.shops)).toBe(true);
      expect(data.shops.length).toBe(1);

      const shop = data.shops[0];
      expect(shop.shopId).toBe(shopA.id);
      expect(shop.shopSubtotal).toBe(200000);
      expect(shop.items.length).toBe(1);
      // kho = 3 ≤ LOW_STOCK_THRESHOLD(5) → có cảnh báo
      expect(shop.items[0].stock_warning).toBe('Chỉ còn 3 sản phẩm');
      // subtotal 200k < 500k, thiếu 300k > 100k → không gợi ý freeship
      expect(shop.freeship_upsell_needed).toBeNull();

      expect(typeof data.totalShippingFee).toBe('number');
      expect(typeof data.totalAmount).toBe('number');
      // có coupon shop FIXED 10k → totalDiscount >= 10k
      expect(data.totalDiscount).toBeGreaterThanOrEqual(10000);

      // NO-WRITE: không sinh order mới
      const orderCountAfter = await dataSource.getRepository(Order).count();
      expect(orderCountAfter).toBe(orderCountBefore);
      // NO-WRITE: coupon KHÔNG bị tiêu thụ
      const couponAfter = await dataSource
        .getRepository(Coupon)
        .findOne({ where: { id: shopCoupon.id } });
      expect(couponAfter?.used_count).toBe(0);
    });

    it('giỏ hàng trống → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders/checkout/preview')
        .set('Authorization', `Bearer ${emptyCustomerToken}`)
        .send({ address_id: (emptyCustomer as any)._addressId });
      expect(res.status).toBe(400);
    });

    it('coupon global không tồn tại → 400 (và vẫn rollback)', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders/checkout/preview')
        .set('Authorization', `Bearer ${orderCustomerToken}`)
        .send({
          address_id: orderCustomerAddress.id,
          global_coupon_code: 'KHONG-TON-TAI-123',
        });
      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // PHASE A — SELLER ORDERS (state machine + IDOR)
  // ==========================================
  describe('Seller Orders', () => {
    it('GET /seller/orders → liệt kê đúng sub-order của shop seller', async () => {
      const res = await request(app.getHttpServer())
        .get('/seller/orders')
        .set('Authorization', `Bearer ${sellerAToken}`)
        .expect(200);

      const items = res.body.data.items;
      expect(Array.isArray(items)).toBe(true);
      const ids = items.map((s: any) => s.id);
      expect(ids).toContain(subOrderA.id); // của shopA
      expect(ids).not.toContain(subOrderB.id); // của shopB — không lộ
    });

    it('GET /seller/orders/:id của shop khác → 404 (IDOR)', async () => {
      await request(app.getHttpServer())
        .get(`/seller/orders/${subOrderB.id}`)
        .set('Authorization', `Bearer ${sellerAToken}`)
        .expect(404);
    });

    it('PATCH status PENDING→DELIVERED → 400 (state machine chặn nhảy cóc)', async () => {
      await request(app.getHttpServer())
        .patch(`/seller/orders/${subOrderA.id}/status`)
        .set('Authorization', `Bearer ${sellerAToken}`)
        .send({ status: OrderStatus.DELIVERED })
        .expect(400);
    });

    it('PATCH status đi đúng tuần tự PENDING→PROCESSING→SHIPPING→DELIVERED', async () => {
      for (const next of [
        OrderStatus.PROCESSING,
        OrderStatus.SHIPPING,
        OrderStatus.DELIVERED,
      ]) {
        const res = await request(app.getHttpServer())
          .patch(`/seller/orders/${subOrderA.id}/status`)
          .set('Authorization', `Bearer ${sellerAToken}`)
          .send({ status: next });
        if (res.status !== 200) {
          // eslint-disable-next-line no-console
          console.log('TRANSITION FAILED:', next, res.status, res.body);
        }
        expect(res.status).toBe(200);
        expect(res.body.data.subOrderStatus).toBe(next);
      }

      const reloaded = await dataSource
        .getRepository(SubOrder)
        .findOne({ where: { id: subOrderA.id } });
      expect(reloaded?.status).toBe(OrderStatus.DELIVERED);
    });

    it('PATCH status sub-order của shop khác → 404 (IDOR)', async () => {
      await request(app.getHttpServer())
        .patch(`/seller/orders/${subOrderB.id}/status`)
        .set('Authorization', `Bearer ${sellerAToken}`)
        .send({ status: OrderStatus.PROCESSING })
        .expect(404);
    });
  });

  // ==========================================
  // PHASE C — NOTIFICATIONS
  // ==========================================
  describe('Notifications', () => {
    it('GET /notifications?is_read=false → chỉ trả thông báo chưa đọc', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications?is_read=false')
        .set('Authorization', `Bearer ${notifUserAToken}`)
        .expect(200);

      const items = res.body.data.items;
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items.every((n: any) => n.is_read === false)).toBe(true);
    });

    it('PATCH /notifications/:id/read của người khác → 404 (IDOR)', async () => {
      await request(app.getHttpServer())
        .patch(`/notifications/${notifUserBId}/read`)
        .set('Authorization', `Bearer ${notifUserAToken}`)
        .expect(404);
    });

    it('PATCH /notifications/:id/read của mình → 200 + is_read=true', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/notifications/${notifUnreadId1}/read`)
        .set('Authorization', `Bearer ${notifUserAToken}`)
        .expect(200);
      expect(res.body.data.is_read).toBe(true);
    });

    it('PATCH /notifications/read-all → updated>0; gọi lại → updated=0', async () => {
      const first = await request(app.getHttpServer())
        .patch('/notifications/read-all')
        .set('Authorization', `Bearer ${notifUserAToken}`)
        .expect(200);
      expect(first.body.data.updated).toBeGreaterThanOrEqual(1);

      const second = await request(app.getHttpServer())
        .patch('/notifications/read-all')
        .set('Authorization', `Bearer ${notifUserAToken}`)
        .expect(200);
      expect(second.body.data.updated).toBe(0);
    });
  });
});
