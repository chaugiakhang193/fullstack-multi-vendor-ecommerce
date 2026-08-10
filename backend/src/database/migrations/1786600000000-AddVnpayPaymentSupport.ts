import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVnpayPaymentSupport1786600000000 implements MigrationInterface {
  name = 'AddVnpayPaymentSupport1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Thêm 'vnpay' vào enum method. IF NOT EXISTS để migration chạy lại không vỡ.
    await queryRunner.query(
      `ALTER TYPE "public"."payment_method_enum" ADD VALUE IF NOT EXISTS 'vnpay'`,
    );

    // Cột kỹ thuật VNPay để đối soát. Tất cả nullable: đơn COD không có giá trị.
    await queryRunner.query(
      `ALTER TABLE "payment"
         ADD COLUMN "vnp_txn_ref" character varying,
         ADD COLUMN "vnp_transaction_no" character varying,
         ADD COLUMN "vnp_response_code" character varying,
         ADD COLUMN "paid_at" TIMESTAMP,
         ADD COLUMN "raw" jsonb`,
    );

    // Unique PHẦN (partial) — mỗi mã giao dịch VNPay chỉ gắn 1 payment, nhưng
    // cho phép NHIỀU NULL (mọi payment COD đều null). Unique thường sẽ chặn NULL thứ 2.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_payment_vnp_txn_ref"
         ON "payment" ("vnp_txn_ref") WHERE "vnp_txn_ref" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_payment_vnp_txn_ref"`);
    await queryRunner.query(
      `ALTER TABLE "payment"
         DROP COLUMN "raw",
         DROP COLUMN "paid_at",
         DROP COLUMN "vnp_response_code",
         DROP COLUMN "vnp_transaction_no",
         DROP COLUMN "vnp_txn_ref"`,
    );
  }
}
