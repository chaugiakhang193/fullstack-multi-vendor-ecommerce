import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReturnNotificationTypes1782900000000 implements MigrationInterface {
  name = 'AddReturnNotificationTypes1782900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" RENAME TO "notification_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_type_enum" AS ENUM('order.created', 'order.status_changed', 'review.created', 'review.replied', 'payout.created', 'payout.status_changed', 'shop.registered', 'return.requested', 'return.status_changed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification" ALTER COLUMN "type" TYPE "public"."notification_type_enum" USING "type"::"text"::"public"."notification_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."notification_type_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" RENAME TO "notification_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_type_enum" AS ENUM('order.created', 'order.status_changed', 'review.created', 'review.replied', 'payout.created', 'payout.status_changed', 'shop.registered')`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification" ALTER COLUMN "type" TYPE "public"."notification_type_enum" USING "type"::"text"::"public"."notification_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."notification_type_enum_old"`);
  }
}
