import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';

import { AppModule } from './../src/app.module';
import { RefactorShopBankInfo1782180000000 } from '../src/database/migrations/1782180000000-RefactorShopBankInfo';
import { User } from '@/modules/users/entities/user.entity';
import { UserRole, AccountStatus } from '@/common/enums';

describe('Database Migration: RefactorShopBankInfo (e2e)', () => {
  let dataSource: DataSource;
  let moduleFixture: TestingModule;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    await moduleFixture.close();
  });

  it('Kiểm tra Data Integrity của Migration up() và down()', async () => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    // 1. Dọn dẹp dữ liệu cũ để tránh xung đột khoá ngoại và bắt đầu từ trạng thái sạch
    await queryRunner.query('DELETE FROM "payout"');
    await queryRunner.query('DELETE FROM "shop"');
    await queryRunner.query('DELETE FROM "user" WHERE email = $1', ['e2e-mbi@example.com']);

    // 1.5 Tạo seller user mẫu để thoả mãn khoá ngoại seller_id
    const userRepo = dataSource.getRepository(User);
    const sellerUser = await userRepo.save(
      userRepo.create({
        username: 'e2e-mbi-seller',
        email: 'e2e-mbi@example.com',
        password: 'Password123!',
        role: UserRole.SELLER,
        status: AccountStatus.ACTIVE,
      }),
    );
    const sellerId = sellerUser.id;

    // 2. Mô phỏng cột cũ: DROP cột jsonb (nếu có) và ADD cột text để test migration up
    await queryRunner.query('ALTER TABLE "shop" DROP COLUMN IF EXISTS "bank_account_info"');
    await queryRunner.query('ALTER TABLE "shop" ADD COLUMN "bank_account_info" text');

    // 3. Chuẩn bị Fixtures với UUID hợp lệ
    const f1_id = crypto.randomUUID();
    const f1_name = 'Shop JSON key moi';
    const f1_bank = '{"bank_name":"VCB","account_number":"1","account_holder":"A"}';

    const f2_id = crypto.randomUUID();
    const f2_name = 'Shop JSON key cu';
    const f2_bank = '{"bank_name":"VCB","bank_account_number":"2","bank_account_name":"B"}';

    const f3_id = crypto.randomUUID();
    const f3_name = 'Shop split text';
    const f3_bank = 'VCB - 123 - NGUYEN VAN A';

    const f4_id = crypto.randomUUID();
    const f4_name = 'Shop text tho';
    const f4_bank = 'chuyen khoan abc';

    const f5_id = crypto.randomUUID();
    const f5_name = 'Shop bank NULL';
    const f5_bank = null;

    const f6_id = crypto.randomUUID();
    const f6_name = 'Shop bank empty string';
    const f6_bank = '';

    const f7_id = crypto.randomUUID();
    const f7_name = 'Shop JSON hong';
    const f7_bank = '{bad json';

    // 4. INSERT fixtures bằng raw SQL
    const insertSql = 'INSERT INTO "shop"(id, name, bank_account_info, seller_id) VALUES ($1, $2, $3, $4)';
    await queryRunner.query(insertSql, [f1_id, f1_name, f1_bank, sellerId]);
    await queryRunner.query(insertSql, [f2_id, f2_name, f2_bank, sellerId]);
    await queryRunner.query(insertSql, [f3_id, f3_name, f3_bank, sellerId]);
    await queryRunner.query(insertSql, [f4_id, f4_name, f4_bank, sellerId]);
    await queryRunner.query(insertSql, [f5_id, f5_name, f5_bank, sellerId]);
    await queryRunner.query(insertSql, [f6_id, f6_name, f6_bank, sellerId]);
    await queryRunner.query(insertSql, [f7_id, f7_name, f7_bank, sellerId]);

    // 5. Chạy migration UP
    const migration = new RefactorShopBankInfo1782180000000();
    await migration.up(queryRunner);

    // 6. Assert kết quả UP
    const selectSql = 'SELECT id, name, bank_account_info FROM "shop" ORDER BY id ASC';
    const shops = await queryRunner.query(selectSql);

    // Query helper function to find by ID
    const findShop = (id: string) => {
      const found = shops.find((s: any) => s.id === id);
      return found;
    };

    // F1: Key mới giữ nguyên
    const shop1 = findShop(f1_id);
    expect(shop1.bank_account_info).toEqual({
      bank_name: 'VCB',
      account_number: '1',
      account_holder: 'A',
    });

    // F2: Key cũ được remap
    const shop2 = findShop(f2_id);
    expect(shop2.bank_account_info).toEqual({
      bank_name: 'VCB',
      account_number: '2',
      account_holder: 'B',
    });

    // F3: Chuỗi split "Bank - Number - Holder" được parse
    const shop3 = findShop(f3_id);
    expect(shop3.bank_account_info).toEqual({
      bank_name: 'VCB',
      account_number: '123',
      account_holder: 'NGUYEN VAN A',
    });

    // F4: Text thô đưa vào account_holder
    const shop4 = findShop(f4_id);
    expect(shop4.bank_account_info).toEqual({
      bank_name: 'Unknown',
      account_number: 'Unknown',
      account_holder: 'chuyen khoan abc',
    });

    // F5: NULL vẫn là NULL
    const shop5 = findShop(f5_id);
    expect(shop5.bank_account_info).toBeNull();

    // F6: Empty string thành NULL
    const shop6 = findShop(f6_id);
    expect(shop6.bank_account_info).toBeNull();

    // F7: JSON hỏng đưa vào account_holder
    const shop7 = findShop(f7_id);
    expect(shop7.bank_account_info).toEqual({
      bank_name: 'Unknown',
      account_number: 'Unknown',
      account_holder: '{bad json',
    });

    // DB Assert chốt:
    // - Không còn key cũ sót lại
    const checkKeySql = `
      SELECT count(*) as count FROM "shop" 
      WHERE bank_account_info IS NOT NULL 
      AND (bank_account_info ? 'bank_account_number' OR bank_account_info ? 'bank_account_name')
    `;
    const checkKeyResult = await queryRunner.query(checkKeySql);
    expect(Number(checkKeyResult[0].count)).toBe(0);

    // - Shop chưa set vẫn NULL (để guard Payouts hoạt động)
    const checkNullSql = 'SELECT count(*) as count FROM "shop" WHERE bank_account_info IS NULL';
    const checkNullResult = await queryRunner.query(checkNullSql);
    expect(Number(checkNullResult[0].count)).toBe(2); // f5 và f6

    // 7. Chạy migration DOWN (Revert)
    await migration.down(queryRunner);

    // 8. Assert kết quả DOWN
    const shopsReverted = await queryRunner.query(selectSql);
    const shop1Reverted = shopsReverted.find((s: any) => s.id === f1_id);
    // Cột phải là kiểu text chứa JSON stringified
    expect(typeof shop1Reverted.bank_account_info).toBe('string');
    const parsedReverted = JSON.parse(shop1Reverted.bank_account_info);
    expect(parsedReverted).toEqual({
      bank_name: 'VCB',
      account_number: '1',
      account_holder: 'A',
    });

    // 9. Dọn dẹp: Đảm bảo trả DB test về cấu trúc cột jsonb để không làm crash các E2E test khác
    await queryRunner.query('DELETE FROM "shop"');
    await queryRunner.query('DELETE FROM "user" WHERE id = $1', [sellerId]);

    await queryRunner.query('ALTER TABLE "shop" DROP COLUMN IF EXISTS "bank_account_info"');
    await queryRunner.query('ALTER TABLE "shop" ADD COLUMN "bank_account_info" jsonb');

    await queryRunner.release();
  });
});
