import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorShopBankInfo1782180000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop" ADD COLUMN "bank_account_info_new" jsonb`);

    // Hàm tạm (session-local, tự hủy cuối session): parse an toàn, không làm abort migration.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION pg_temp.migrate_bank_info(raw text)
      RETURNS jsonb LANGUAGE plpgsql AS $$
      DECLARE j jsonb;
      BEGIN
        -- Shop chưa cấu hình -> giữ NULL (để guard Payouts hoạt động đúng)
        IF raw IS NULL OR btrim(raw) = '' THEN
          RETURN NULL;
        END IF;

        -- Trường hợp JSON: remap key cũ (bank_account_number/bank_account_name) sang key mới
        BEGIN
          j := raw::jsonb;
          RETURN jsonb_build_object(
            'bank_name',      COALESCE(j->>'bank_name', 'Unknown'),
            'account_number', COALESCE(j->>'account_number', j->>'bank_account_number', 'Unknown'),
            'account_holder', COALESCE(j->>'account_holder', j->>'bank_account_name', 'Unknown')
          );
        EXCEPTION WHEN others THEN
          NULL; -- không phải JSON hợp lệ -> xử lý dạng chuỗi bên dưới
        END;

        -- Dạng "Bank - Number - Holder"
        IF raw LIKE '% - % - %' THEN
          RETURN jsonb_build_object(
            'bank_name',      split_part(raw, ' - ', 1),
            'account_number', split_part(raw, ' - ', 2),
            'account_holder', split_part(raw, ' - ', 3)
          );
        END IF;

        -- Text thô không nhận dạng: giữ nguyên văn ở account_holder (không mất dữ liệu)
        RETURN jsonb_build_object(
          'bank_name', 'Unknown',
          'account_number', 'Unknown',
          'account_holder', raw
        );
      END;
      $$;
    `);

    await queryRunner.query(`
      UPDATE "shop" SET "bank_account_info_new" = pg_temp.migrate_bank_info("bank_account_info")
    `);

    await queryRunner.query(`ALTER TABLE "shop" DROP COLUMN "bank_account_info"`);
    await queryRunner.query(`ALTER TABLE "shop" RENAME COLUMN "bank_account_info_new" TO "bank_account_info"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse: jsonb -> text (lưu lại dạng chuỗi JSON; có cấu trúc, đọc lại được)
    await queryRunner.query(`ALTER TABLE "shop" ADD COLUMN "bank_account_info_old" text`);
    await queryRunner.query(`UPDATE "shop" SET "bank_account_info_old" = "bank_account_info"::text`);
    await queryRunner.query(`ALTER TABLE "shop" DROP COLUMN "bank_account_info"`);
    await queryRunner.query(`ALTER TABLE "shop" RENAME COLUMN "bank_account_info_old" TO "bank_account_info"`);
  }
}
