import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { DataSource } from 'typeorm';
import { Shop } from '@/modules/shops/entities/shop.entity';
import { User } from '@/modules/users/entities/user.entity';
import { Address } from '@/modules/users/entities/address.entity';
import { Coupon } from '@/modules/promotions/entities/coupon.entity';
import { CouponType, DiscountType } from '@/common/enums';

async function seedTestData() {
  console.log('====== BẮT ĐẦU SEED DỮ LIỆU KIỂM THỬ E2E ======');
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  const shopRepository = dataSource.getRepository(Shop);
  const userRepository = dataSource.getRepository(User);
  const addressRepository = dataSource.getRepository(Address);
  const couponRepository = dataSource.getRepository(Coupon);

  try {
    // 0. Dọn dẹp dữ liệu cũ tránh lỗi FK của OutboxWorker
    console.log('-> Dọn dẹp các outbox event và order cũ...');
    await dataSource.query('DELETE FROM "notification";');
    await dataSource.query('DELETE FROM "outbox_event";');
    await dataSource.query('DELETE FROM "order_item";');
    await dataSource.query('DELETE FROM "sub_order";');
    await dataSource.query('DELETE FROM "payment";');
    await dataSource.query('DELETE FROM "order";');
    console.log('   Dữ liệu cũ đã được làm sạch.');

    // 1. Cập nhật tọa độ Shop 1 & Shop 2
    console.log('-> Cập nhật tọa độ cho Shop 1...');
    const shop1 = await shopRepository.findOne({
      where: { name: 'Vũ Trụ Thời Trang & Công Nghệ - Dev Store' },
    });
    if (shop1) {
      shop1.lat = '21.018151';
      shop1.lng = '105.807849';
      shop1.is_coordinates_verified = true;
      await shopRepository.save(shop1);
      console.log('   Shop 1 updated.');
    } else {
      console.log('   Shop 1 not found!');
    }

    console.log('-> Cập nhật tọa độ cho Shop 2...');
    const shop2 = await shopRepository.findOne({
      where: { name: 'Thế Giới Phụ Kiện & Điện Máy - Dev Store 2' },
    });
    if (shop2) {
      shop2.lat = '20.998495';
      shop2.lng = '105.800057';
      shop2.is_coordinates_verified = true;
      await shopRepository.save(shop2);
      console.log('   Shop 2 updated.');
    } else {
      console.log('   Shop 2 not found!');
    }

    // 2. Tạo địa chỉ mặc định cho Customer buyer_dev@example.com
    console.log('-> Tạo địa chỉ mặc định cho buyer_dev@example.com...');
    const buyer = await userRepository.findOne({
      where: { email: 'buyer_dev@example.com' },
    });
    if (buyer) {
      // Xóa các địa chỉ cũ để tránh trùng lặp
      await addressRepository.delete({ user: { id: buyer.id } });

      const address = addressRepository.create({
        user: buyer,
        address_line: '789 Đường Giải Phóng, Giáp Bát, Hoàng Mai, Hà Nội',
        lat: '20.985906',
        lng: '105.842721',
        is_default: true,
        recipient_name: 'Buyer Dev Account',
        phone: '0987654323',
      });
      await addressRepository.save(address);
      console.log('   Address created.');
    } else {
      console.log('   Buyer not found!');
    }

    // 3. Tạo coupon cho Shop 1
    console.log('-> Tạo coupon cho Shop 1...');
    if (shop1) {
      // Xóa coupon cũ nếu có
      await couponRepository.delete({ shop: { id: shop1.id } });

      const coupon1 = couponRepository.create({
        code: 'FASHION50',
        type: CouponType.SHOP,
        shop: shop1,
        discount_type: DiscountType.FIXED_AMOUNT,
        discount_value: 50000, // giảm 50k
        min_order_value: 200000, // min order 200k
        max_discount_value: 50000,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days later
        usage_limit: 100,
        used_count: 0,
      });
      await couponRepository.save(coupon1);
      console.log('   Coupon FASHION50 created.');
    }

    console.log('====== HOÀN THÀNH SEED DỮ LIỆU KIỂM THỬ E2E ======');
  } catch (error) {
    console.error('Lỗi khi seed dữ liệu kiểm thử:', error);
  } finally {
    await app.close();
  }
}

seedTestData();
