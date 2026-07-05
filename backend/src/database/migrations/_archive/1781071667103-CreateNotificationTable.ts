import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationTable1781071667103 implements MigrationInterface {
  name = 'CreateNotificationTable1781071667103';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Dùng DO block để tránh lỗi "type already exists" nếu migration chạy lại
    // (ví dụ: lần trước enum tạo xong nhưng migration fail ở bước sau, gây rollback rồi retry).
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."notification_type_enum" AS ENUM('order.created', 'order.status_changed');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

    // Bảng notification có thể đã tồn tại từ synchronize cũ (không có cột type, rỗng data).
    // DROP IF EXISTS để tạo lại đúng schema với cột type.
    await queryRunner.query(`DROP TABLE IF EXISTS "notification"`);

    await queryRunner.query(`
      CREATE TABLE "notification" (
        "id"         uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"    uuid              NOT NULL,
        "type"       "public"."notification_type_enum" NOT NULL,
        "title"      character varying,
        "content"    text,
        "is_read"    boolean           NOT NULL DEFAULT false,
        "created_at" TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notification_user" FOREIGN KEY ("user_id")
          REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    // Index tương ứng @Index(['user', 'is_read', 'created_at']) trên entity.
    // Migration PrepareSprint2Schema1780753516487 đã cố tạo index này nhưng thất bại vì bảng chưa tồn tại.
    await queryRunner.query(`
      CREATE INDEX "IDX_notification_user_read_created"
      ON "notification" ("user_id", "is_read", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_notification_user_read_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "notification"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."notification_type_enum"`,
    );
  }
}
