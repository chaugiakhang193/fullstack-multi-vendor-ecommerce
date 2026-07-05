import { MigrationInterface, QueryRunner } from 'typeorm';

export class PrepareSprint2Schema1780753516487 implements MigrationInterface {
  name = 'PrepareSprint2Schema1780753516487';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."idempotency_keys_status_enum" AS ENUM('pending', 'completed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "idempotency_keys" ("key" character varying(255) NOT NULL, "status" "public"."idempotency_keys_status_enum" NOT NULL DEFAULT 'pending', "response_code" integer, "response_body" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0afd83cbf08c9d12089a9bffc5e" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(`ALTER TABLE "shop" ADD "lat" numeric(10,6)`);
    await queryRunner.query(`ALTER TABLE "shop" ADD "lng" numeric(10,6)`);
    await queryRunner.query(
      `ALTER TABLE "shop" ADD "is_coordinates_verified" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "address" ADD "recipient_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "address" ADD "phone" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" ADD "product_name" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" ADD "variant_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" ADD "product_thumbnail" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" ADD "variant_attributes" jsonb`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_status_enum" AS ENUM('pending', 'processing', 'shipping', 'delivered', 'cancelled', 'returned')`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD "status" "public"."order_status_enum" NOT NULL DEFAULT 'pending'`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD "idempotency_key" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD CONSTRAINT "UQ_84cba07199e5bb9fbc3261d50d7" UNIQUE ("idempotency_key")`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD "order_number" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD CONSTRAINT "UQ_f9180f384353c621e8d0c414c14" UNIQUE ("order_number")`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variant" ALTER COLUMN "stock_quantity" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variant" ALTER COLUMN "stock_quantity" SET DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN "shipping_address"`,
    );
    await queryRunner.query(`ALTER TABLE "order" ADD "shipping_address" jsonb`);
    await queryRunner.query(
      `ALTER TABLE "payment" DROP CONSTRAINT "FK_f5221735ace059250daac9d9803"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD CONSTRAINT "UQ_f5221735ace059250daac9d9803" UNIQUE ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3b4da947c6971422b52e1de436" ON "sub_order" ("shop_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ad3284c37a2eb7da1b5090b2c2" ON "order" ("customer_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_00854909abbcebd77dabb4335e" ON "notification" ("user_id", "is_read", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variant" ADD CONSTRAINT "CHK_7006aac019e4258dd3c98d8270" CHECK (stock_quantity >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD CONSTRAINT "FK_f5221735ace059250daac9d9803" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment" DROP CONSTRAINT "FK_f5221735ace059250daac9d9803"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variant" DROP CONSTRAINT "CHK_7006aac019e4258dd3c98d8270"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_00854909abbcebd77dabb4335e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ad3284c37a2eb7da1b5090b2c2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3b4da947c6971422b52e1de436"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" DROP CONSTRAINT "UQ_f5221735ace059250daac9d9803"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD CONSTRAINT "FK_f5221735ace059250daac9d9803" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN "shipping_address"`,
    );
    await queryRunner.query(`ALTER TABLE "order" ADD "shipping_address" text`);
    await queryRunner.query(
      `ALTER TABLE "product_variant" ALTER COLUMN "stock_quantity" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variant" ALTER COLUMN "stock_quantity" DROP NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN "updated_at"`);
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "updated_at"`);
    await queryRunner.query(
      `ALTER TABLE "order" DROP CONSTRAINT "UQ_f9180f384353c621e8d0c414c14"`,
    );
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "order_number"`);
    await queryRunner.query(
      `ALTER TABLE "order" DROP CONSTRAINT "UQ_84cba07199e5bb9fbc3261d50d7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN "idempotency_key"`,
    );
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "public"."order_status_enum"`);
    await queryRunner.query(
      `ALTER TABLE "order_item" DROP COLUMN "variant_attributes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" DROP COLUMN "product_thumbnail"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" DROP COLUMN "variant_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" DROP COLUMN "product_name"`,
    );
    await queryRunner.query(`ALTER TABLE "address" DROP COLUMN "phone"`);
    await queryRunner.query(
      `ALTER TABLE "address" DROP COLUMN "recipient_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shop" DROP COLUMN "is_coordinates_verified"`,
    );
    await queryRunner.query(`ALTER TABLE "shop" DROP COLUMN "lng"`);
    await queryRunner.query(`ALTER TABLE "shop" DROP COLUMN "lat"`);
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
    await queryRunner.query(
      `DROP TYPE "public"."idempotency_keys_status_enum"`,
    );
  }
}
