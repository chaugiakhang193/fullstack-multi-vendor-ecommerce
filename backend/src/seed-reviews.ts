import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '@/app.module';
import { User } from '@/modules/users/entities/user.entity';
import { Product } from '@/modules/products/entities/product.entity';
import { Order } from '@/modules/orders/entities/order.entity';
import { SubOrder } from '@/modules/orders/entities/sub-order.entity';
import { OrderItem } from '@/modules/orders/entities/order-item.entity';
import { Review } from '@/modules/engagements/entities/review.entity';
import { UserRole, AccountStatus, OrderStatus } from '@/common/enums';
import { assertLocalDbOrExplicitOverride } from '@/common/helpers/assert-local-db';

// Nhận diện + dọn dẹp reviewer seed qua email domain riêng.
const SEED_EMAIL_DOMAIN = '@seed.giangkha.local';
const ORDER_PREFIX = 'SEED-';

const REVIEWERS = [
  { username: 'seed_minhanh', full_name: 'Nguyễn Minh Anh' },
  { username: 'seed_quochuy', full_name: 'Trần Quốc Huy' },
  { username: 'seed_thuytrang', full_name: 'Lê Thùy Trang' },
  { username: 'seed_giabao', full_name: 'Phạm Gia Bảo' },
  { username: 'seed_haiyen', full_name: 'Vũ Hải Yến' },
];

const COMMENTS = [
  'Sản phẩm chất lượng, đúng như mô tả. Giao hàng nhanh, đóng gói cẩn thận.',
  'Mình rất hài lòng, chắc chắn sẽ ủng hộ shop lần sau.',
  'Hàng đẹp, giá hợp lý. Shop tư vấn nhiệt tình dễ thương.',
  'Đóng gói kỹ, sản phẩm y hình. Rất đáng mua!',
  'Giao nhanh hơn dự kiến, chất lượng ổn trong tầm giá.',
  'Dùng ổn định, đáng đồng tiền. Cảm ơn shop nhé.',
  'Sản phẩm tốt, sẽ giới thiệu thêm bạn bè vào mua.',
  'Chất lượng vượt mong đợi, cho shop 5 sao.',
  'Ổn áp nha mọi người, giao hàng đúng hẹn.',
  'Hài lòng cả về sản phẩm lẫn thái độ phục vụ.',
  'Mẫu mã đẹp, hàng giao cẩn thận không móp méo.',
  'Giá tốt, chất lượng tương xứng. Sẽ quay lại ủng hộ.',
  'Shop uy tín, sản phẩm đúng chất lượng quảng cáo.',
  'Dùng một thời gian thấy ổn, không có gì để chê.',
  'Đáng tiền, cảm ơn shop đã hỗ trợ nhiệt tình.',
];

// Nghiêng về 5 sao, ít 4, hiếm 3 → avg ~4.5-4.8 (tự nhiên).
function pickRating(): number {
  const r = Math.random();
  if (r < 0.6) return 5;
  if (r < 0.9) return 4;
  return 3;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seedReviews() {
  assertLocalDbOrExplicitOverride('seed-reviews');
  console.log('====== SEED REVIEWS — BẮT ĐẦU ======');
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  const userRepo = dataSource.getRepository(User);
  const productRepo = dataSource.getRepository(Product);
  const orderRepo = dataSource.getRepository(Order);
  const subOrderRepo = dataSource.getRepository(SubOrder);
  const orderItemRepo = dataSource.getRepository(OrderItem);
  const reviewRepo = dataSource.getRepository(Review);

  try {
    // 1. DỌN seed cũ (idempotent). Xoá order của reviewer seed → CASCADE sub_order/order_item/review.
    console.log('-> Dọn dữ liệu seed cũ (nếu có)...');
    const oldReviewers = await userRepo
      .createQueryBuilder('u')
      .where('u.email LIKE :d', { d: `%${SEED_EMAIL_DOMAIN}` })
      .getMany();
    if (oldReviewers.length > 0) {
      const ids = oldReviewers.map((u) => u.id);
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(Order)
        .where('customer_id IN (:...ids)', { ids })
        .execute();
      await userRepo.delete(ids);
      console.log(
        `   Đã xoá ${oldReviewers.length} reviewer seed cũ + đơn của họ.`,
      );
    }

    // 2. Tạo reviewer users (customer, active, password null — chỉ để attribution review).
    console.log('-> Tạo reviewer users...');
    const reviewers: User[] = [];
    for (const r of REVIEWERS) {
      const u = userRepo.create({
        username: r.username,
        email: `${r.username}${SEED_EMAIL_DOMAIN}`,
        full_name: r.full_name,
        password: null,
        role: UserRole.CUSTOMER,
        status: AccountStatus.ACTIVE,
      });
      reviewers.push(await userRepo.save(u));
    }
    console.log(`   Đã tạo ${reviewers.length} reviewer.`);

    // 3. Lấy sản phẩm active + không ẩn, kèm shop → nhóm theo shop.
    console.log('-> Lấy sản phẩm active...');
    const products = await productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.shop', 'shop')
      .where('p.status = :st', { st: 'active' })
      .andWhere('p.is_hidden = false')
      .getMany();

    const byShop = new Map<
      string,
      { shop: Product['shop']; items: Product[] }
    >();
    for (const p of products) {
      if (!p.shop) continue;
      const key = p.shop.id;
      if (!byShop.has(key)) byShop.set(key, { shop: p.shop, items: [] });
      byShop.get(key)!.items.push(p);
    }
    console.log(`   ${products.length} sản phẩm thuộc ${byShop.size} shop.`);

    // 4. Mỗi reviewer × mỗi shop → 1 order DELIVERED mua subset sản phẩm, review từng món.
    let orderCount = 0;
    let reviewCount = 0;
    let seq = 0;
    for (const reviewer of reviewers) {
      for (const group of byShop.values()) {
        // Mỗi reviewer mua ~75% sản phẩm của shop (ngẫu nhiên) → review count lệch tự nhiên.
        const chosen = group.items.filter(() => Math.random() < 0.75);
        if (chosen.length === 0) continue;

        seq++;
        const subTotal = chosen.reduce((s, p) => s + Number(p.price), 0);

        const order = orderRepo.create({
          customer: reviewer,
          status: OrderStatus.DELIVERED,
          order_number: `${ORDER_PREFIX}${Date.now()}-${seq}`,
          total_amount: subTotal,
          shipping_address: {
            recipient_name: reviewer.full_name,
            phone: '0900000000',
            address_line: 'Địa chỉ khách hàng (dữ liệu demo)',
            lat: 10.7769,
            lng: 106.7009,
          },
        });
        const savedOrder = await orderRepo.save(order);

        const subOrder = subOrderRepo.create({
          shop: group.shop,
          order: savedOrder,
          status: OrderStatus.DELIVERED,
          delivered_at: new Date(),
          sub_total: subTotal,
          shipping_fee: 0,
          shop_discount_amount: 0,
          total_amount: subTotal,
        });
        const savedSub = await subOrderRepo.save(subOrder);

        for (const p of chosen) {
          const item = orderItemRepo.create({
            sub_order: savedSub,
            product: p,
            quantity: 1,
            price_at_purchase: Number(p.price),
            product_name: p.name,
            product_thumbnail: p.thumbnail_url ?? undefined,
          });
          const savedItem = await orderItemRepo.save(item);

          const review = reviewRepo.create({
            user: reviewer,
            product: p,
            order_item: savedItem,
            rating: pickRating(),
            comment: pick(COMMENTS),
          });
          await reviewRepo.save(review);
          reviewCount++;
        }
        orderCount++;
      }
    }
    console.log(
      `   Đã tạo ${orderCount} đơn DELIVERED + ${reviewCount} review.`,
    );

    // 5. Tính lại avg_rating/review_count cho MỌI product (khớp logic app).
    console.log('-> Tính lại avg_rating / review_count...');
    await dataSource.query(`
      UPDATE "product" p SET
        avg_rating = COALESCE(
          ROUND((SELECT AVG(r.rating) FROM "review" r WHERE r.product_id = p.id)::numeric, 1),
          0
        ),
        review_count = (SELECT COUNT(*) FROM "review" r WHERE r.product_id = p.id)
    `);

    // 6. Backdate ngày cho tự nhiên (created_at là @CreateDateColumn → phải set qua SQL).
    console.log('-> Backdate ngày...');
    await dataSource.query(`
      UPDATE "order" o
      SET created_at = now() - ((random() * 55 + 5) || ' days')::interval
      WHERE o.order_number LIKE '${ORDER_PREFIX}%'
    `);
    await dataSource.query(`
      UPDATE "sub_order" so
      SET created_at = o.created_at, delivered_at = o.created_at + interval '2 days'
      FROM "order" o
      WHERE so.order_id = o.id AND o.order_number LIKE '${ORDER_PREFIX}%'
    `);
    await dataSource.query(`
      UPDATE "review" r
      SET created_at = so.created_at + interval '3 days'
      FROM "order_item" oi
      JOIN "sub_order" so ON so.id = oi.sub_order_id
      JOIN "order" o ON o.id = so.order_id
      WHERE r.order_item_id = oi.id AND o.order_number LIKE '${ORDER_PREFIX}%'
    `);

    console.log('====== SEED REVIEWS — HOÀN TẤT ======');
  } catch (err) {
    console.error('LỖI seed reviews:', err);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

seedReviews();
