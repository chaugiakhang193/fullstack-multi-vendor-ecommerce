import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentAttemptTable1786700000000 implements MigrationInterface {
  name = 'CreatePaymentAttemptTable1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tái dùng payment_status_enum có sẵn thay vì tạo enum riêng: hai bảng nói về
    // cùng một tập trạng thái, tách ra là hai nguồn phải sửa song song mỗi lần đổi.
    await queryRunner.query(
      `CREATE TABLE "payment_attempt" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "payment_id" uuid NOT NULL,
         "vnp_txn_ref" character varying NOT NULL,
         "amount" numeric(12,2) NOT NULL,
         "status" "public"."payment_status_enum" NOT NULL DEFAULT 'pending',
         "vnp_transaction_no" character varying,
         "vnp_response_code" character varying,
         "ipn_received_at" TIMESTAMP,
         "raw" jsonb,
         "created_at" TIMESTAMP NOT NULL DEFAULT now(),
         CONSTRAINT "PK_payment_attempt" PRIMARY KEY ("id")
       )`,
    );

    await queryRunner.query(
      `ALTER TABLE "payment_attempt"
         ADD CONSTRAINT "FK_payment_attempt_payment"
         FOREIGN KEY ("payment_id") REFERENCES "payment"("id")
         ON DELETE CASCADE`,
    );

    // Unique THƯỜNG (không phải partial như trên bảng payment): cột NOT NULL, và
    // đây là khoá tra cứu của IPN nên trùng mã là hỏng đối soát.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_payment_attempt_vnp_txn_ref"
         ON "payment_attempt" ("vnp_txn_ref")`,
    );

    // Truy vấn "các lần thử của đơn này" khi đối soát/debug.
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_attempt_payment_id"
         ON "payment_attempt" ("payment_id")`,
    );

    // Backfill: từ commit này IPN tra bảng attempt, nên payment VNPAY đã tồn tại mà
    // không có attempt tương ứng sẽ đột nhiên nhận RspCode 01 nếu VNPay gọi lại.
    // created_at lấy theo payment (mốc gần đúng — không có mốc tạo URL thật).
    await queryRunner.query(
      `INSERT INTO "payment_attempt" (
         "payment_id", "vnp_txn_ref", "amount", "status",
         "vnp_transaction_no", "vnp_response_code", "ipn_received_at", "raw", "created_at"
       )
       SELECT "id", "vnp_txn_ref", "amount", "status",
              "vnp_transaction_no", "vnp_response_code", "paid_at", "raw", "created_at"
       FROM "payment"
       WHERE "vnp_txn_ref" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_attempt_payment_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_payment_attempt_vnp_txn_ref"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_attempt" DROP CONSTRAINT "FK_payment_attempt_payment"`,
    );
    await queryRunner.query(`DROP TABLE "payment_attempt"`);
  }
}
