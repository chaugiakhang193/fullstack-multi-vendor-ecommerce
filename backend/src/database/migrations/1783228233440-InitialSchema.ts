import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1783228233440 implements MigrationInterface {
  name = 'InitialSchema1783228233440';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."user_role_enum" AS ENUM('admin', 'customer', 'seller')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_status_enum" AS ENUM('pending_verification', 'pending_approval', 'new_seller', 'active', 'suspended', 'banned', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "username" character varying NOT NULL, "email" character varying NOT NULL, "password" character varying, "google_id" character varying, "role" "public"."user_role_enum" NOT NULL DEFAULT 'customer', "status" "public"."user_status_enum" NOT NULL DEFAULT 'pending_verification', "full_name" character varying, "phone" character varying, "avatar_url" character varying, "password_changed_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_78a916df40e02a9deb1c4b75edb" UNIQUE ("username"), CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "UQ_7adac5c0b28492eb292d4a93871" UNIQUE ("google_id"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."verification_token_type_enum" AS ENUM('verify_email', 'reset_password')`,
    );
    await queryRunner.query(
      `CREATE TABLE "verification_token" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "token" character varying, "type" "public"."verification_token_type_enum" NOT NULL, "expires_at" TIMESTAMP, "user_id" uuid, CONSTRAINT "PK_74bc3066ea24f13f37d52a12c79" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "session" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "refresh_token" character varying, "expires_at" TIMESTAMP, "user_id" uuid, CONSTRAINT "PK_f55da76ac1c3ac420f444d2ff11" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "address" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "address_line" text, "lat" numeric(10,6), "lng" numeric(10,6), "is_default" boolean NOT NULL DEFAULT false, "recipient_name" character varying, "phone" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, CONSTRAINT "PK_d92de1f82754668b5f5f5dd4fd5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "category" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "display_order" integer, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "parent_id" uuid, CONSTRAINT "UQ_23c05c292c439d77b0de816b500" UNIQUE ("name"), CONSTRAINT "UQ_cb73208f151aa71cdd78f662d70" UNIQUE ("slug"), CONSTRAINT "PK_9c4e4a89e3674fc9f382d733f03" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."media_assets_type_enum" AS ENUM('shop_logo', 'shop_banner', 'shop_gallery', 'product_image', 'product_thumbnail', 'product_gallery', 'product_variant_image', 'user_avatar')`,
    );
    await queryRunner.query(
      `CREATE TABLE "media_assets" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "public_id" character varying NOT NULL, "url" character varying NOT NULL, "type" "public"."media_assets_type_enum" NOT NULL, "shop_id" uuid, "product_id" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "owner_id" uuid, CONSTRAINT "PK_ca47e9f67a5e5d8af1e75d66ee6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."shop_status_enum" AS ENUM('pending_verification', 'pending_approval', 'new_seller', 'active', 'suspended', 'banned', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "shop" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying NOT NULL, "logo_url" character varying, "banner_url" character varying, "description" text, "bank_account_info" jsonb, "pickup_address" text, "lat" numeric(10,6), "lng" numeric(10,6), "is_coordinates_verified" boolean NOT NULL DEFAULT false, "reject_reason" text, "status" "public"."shop_status_enum" NOT NULL DEFAULT 'pending_approval', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "seller_id" uuid NOT NULL, CONSTRAINT "PK_ad47b7c6121fe31cb4b05438e44" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."coupon_type_enum" AS ENUM('global', 'shop')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."coupon_discount_type_enum" AS ENUM('percentage', 'fixed_amount')`,
    );
    await queryRunner.query(
      `CREATE TABLE "coupon" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "code" character varying NOT NULL, "type" "public"."coupon_type_enum" NOT NULL, "discount_type" "public"."coupon_discount_type_enum", "discount_value" numeric(12,2), "min_order_value" numeric(12,2), "max_discount_value" numeric(12,2), "start_date" TIMESTAMP, "end_date" TIMESTAMP, "usage_limit" integer, "used_count" integer NOT NULL DEFAULT '0', "shop_id" uuid, CONSTRAINT "UQ_62d3c5b0ce63a82c48e86d904bc" UNIQUE ("code"), CONSTRAINT "PK_fcbe9d72b60eed35f46dc35a682" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_method_enum" AS ENUM('cod')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_status_enum" AS ENUM('pending', 'completed', 'failed', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "method" "public"."payment_method_enum", "status" "public"."payment_status_enum" NOT NULL DEFAULT 'pending', "amount" numeric(12,2), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "order_id" uuid, CONSTRAINT "REL_f5221735ace059250daac9d980" UNIQUE ("order_id"), CONSTRAINT "PK_fcaec7df5adf9cac408c686b2ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_status_enum" AS ENUM('pending', 'processing', 'shipping', 'delivered', 'cancelled', 'returned')`,
    );
    await queryRunner.query(
      `CREATE TABLE "order" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "total_amount" numeric(12,2), "global_discount_amount" numeric(12,2), "global_coupon_code" character varying, "shipping_address" jsonb, "status" "public"."order_status_enum" NOT NULL DEFAULT 'pending', "idempotency_key" character varying, "order_number" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "customer_id" uuid, "global_coupon_id" uuid, CONSTRAINT "UQ_84cba07199e5bb9fbc3261d50d7" UNIQUE ("idempotency_key"), CONSTRAINT "UQ_f9180f384353c621e8d0c414c14" UNIQUE ("order_number"), CONSTRAINT "PK_1031171c13130102495201e3e20" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ad3284c37a2eb7da1b5090b2c2" ON "order" ("customer_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_status_enum" AS ENUM('active', 'deleted')`,
    );
    await queryRunner.query(
      `CREATE TABLE "product" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "sku" character varying, "description" text, "price" numeric(12,2) NOT NULL, "weight" integer NOT NULL DEFAULT '0', "length" integer, "width" integer, "height" integer, "thumbnail_url" character varying, "gallery" text, "stock_quantity" integer NOT NULL DEFAULT '0', "has_variants" boolean NOT NULL DEFAULT false, "is_hidden" boolean NOT NULL DEFAULT false, "is_featured" boolean NOT NULL DEFAULT false, "status" "public"."product_status_enum" NOT NULL DEFAULT 'active', "avg_rating" numeric(2,1) NOT NULL DEFAULT '0', "review_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "shop_id" uuid, "category_id" uuid, CONSTRAINT "CHK_1149738dc84b1cadb48a928eaa" CHECK (stock_quantity >= 0), CONSTRAINT "PK_bebc9158e480b949565b4dc7a82" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_variant" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying, "attributes" jsonb, "sku" character varying, "additional_price" numeric(12,2) NOT NULL DEFAULT '0', "stock_quantity" integer NOT NULL DEFAULT '0', "images" text, "product_id" uuid, CONSTRAINT "CHK_7006aac019e4258dd3c98d8270" CHECK (stock_quantity >= 0), CONSTRAINT "PK_1ab69c9935c61f7c70791ae0a9f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "order_item" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "quantity" integer, "price_at_purchase" numeric(12,2), "product_name" character varying NOT NULL, "variant_name" character varying, "product_thumbnail" text, "variant_attributes" jsonb, "variant_id" uuid, "sub_order_id" uuid, "product_id" uuid, CONSTRAINT "PK_d01158fe15b1ead5c26fd7f4e90" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sub_order_status_enum" AS ENUM('pending', 'processing', 'shipping', 'delivered', 'cancelled', 'returned')`,
    );
    await queryRunner.query(
      `CREATE TABLE "sub_order" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "sub_total" numeric(12,2), "shipping_fee" numeric(12,2), "shop_discount_amount" numeric(12,2) NOT NULL DEFAULT '0', "shop_coupon_code" character varying, "total_amount" numeric(12,2), "status" "public"."sub_order_status_enum" NOT NULL DEFAULT 'pending', "delivered_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "shop_id" uuid, "order_id" uuid, "shop_coupon_id" uuid, CONSTRAINT "PK_e07c98da0cb6b2b2c59c811af62" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3b4da947c6971422b52e1de436" ON "sub_order" ("shop_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."return_request_status_enum" AS ENUM('requested', 'approved', 'rejected', 'received', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."return_request_reason_enum" AS ENUM('damaged', 'wrong_item', 'not_as_described', 'missing_parts', 'changed_mind', 'other')`,
    );
    await queryRunner.query(
      `CREATE TABLE "return_request" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "status" "public"."return_request_status_enum" NOT NULL DEFAULT 'requested', "reason" "public"."return_request_reason_enum" NOT NULL, "customer_note" text, "refund_total" numeric(12,2) NOT NULL DEFAULT '0', "seller_note" text, "resolved_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "sub_order_id" uuid NOT NULL, "customer_id" uuid NOT NULL, "shop_id" uuid, CONSTRAINT "PK_27b4fb62d047bfc2259c2ae4d64" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cd30857d0be5fa9060d7971726" ON "return_request" ("shop_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "return_item" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "quantity" integer NOT NULL, "refund_amount" numeric(12,2) NOT NULL DEFAULT '0', "return_request_id" uuid NOT NULL, "order_item_id" uuid NOT NULL, CONSTRAINT "PK_8107861535dc7f65333a1f1a3de" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_372b7bcda8abc00fff75d17abf" ON "return_item" ("order_item_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_coupon" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "is_used" boolean NOT NULL DEFAULT false, "used_at" TIMESTAMP, "user_id" uuid, "coupon_id" uuid, CONSTRAINT "UQ_5e9c3e76a1d975269ceb52f66af" UNIQUE ("user_id", "coupon_id"), CONSTRAINT "PK_34bde3cbeb5831436fbe97ccb2a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payout_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payout" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "amount" numeric(12,2) NOT NULL, "commission_fee" numeric(12,2) NOT NULL DEFAULT '0', "status" "public"."payout_status_enum" NOT NULL DEFAULT 'pending', "reject_reason" text, "bank_info_snapshot" jsonb NOT NULL, "resolved_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "shop_id" uuid, "resolved_by" uuid, CONSTRAINT "PK_1cb73ce021dc6618a3818b0a474" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."outbox_event_status_enum" AS ENUM('pending', 'processed', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "outbox_event" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "event_type" character varying NOT NULL, "payload" jsonb NOT NULL, "status" "public"."outbox_event_status_enum" NOT NULL DEFAULT 'pending', "error_message" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "processed_at" TIMESTAMP, CONSTRAINT "PK_cc0c9e40998e45ecfc5e313429d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."idempotency_keys_status_enum" AS ENUM('pending', 'completed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "idempotency_keys" ("key" character varying(255) NOT NULL, "status" "public"."idempotency_keys_status_enum" NOT NULL DEFAULT 'pending', "response_code" integer, "response_body" jsonb, "user_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0afd83cbf08c9d12089a9bffc5e" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_06f372d2d5b1c6e18ceb91cdf7" ON "idempotency_keys" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "review" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "rating" integer, "comment" text, "reply_from_seller" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, "product_id" uuid, "order_item_id" uuid NOT NULL, CONSTRAINT "UQ_6fb5caf1d99ffc8dab2dcbbcf62" UNIQUE ("order_item_id"), CONSTRAINT "PK_2e4299a343a81574217255c00ca" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_type_enum" AS ENUM('order.created', 'order.status_changed', 'review.created', 'review.replied', 'payout.created', 'payout.status_changed', 'shop.registered', 'return.requested', 'return.status_changed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "type" "public"."notification_type_enum" NOT NULL, "title" character varying, "content" text, "data" jsonb, "is_read" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, CONSTRAINT "PK_705b6c7cdf9b2c2ff7ac7872cb7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_00854909abbcebd77dabb4335e" ON "notification" ("user_id", "is_read", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "cart_item" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "session_id" character varying, "quantity" integer NOT NULL DEFAULT '1', "added_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, "variant_id" uuid, "product_id" uuid, CONSTRAINT "PK_bd94725aa84f8cf37632bcde997" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_03de0ba44e04c2127122a353b3" ON "cart_item" ("user_id", "added_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "shop_categories" ("shop_id" uuid NOT NULL, "category_id" uuid NOT NULL, CONSTRAINT "PK_4230ee63b02057d4028fcc4241a" PRIMARY KEY ("shop_id", "category_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2538b463070f40928e80f0d028" ON "shop_categories" ("shop_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ee4fccaada563c04413b8916d0" ON "shop_categories" ("category_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_token" ADD CONSTRAINT "FK_b007d3e37939a8856da8ddb90ca" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "session" ADD CONSTRAINT "FK_30e98e8746699fb9af235410aff" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "address" ADD CONSTRAINT "FK_35cd6c3fafec0bb5d072e24ea20" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "category" ADD CONSTRAINT "FK_1117b4fcb3cd4abb4383e1c2743" FOREIGN KEY ("parent_id") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" ADD CONSTRAINT "FK_a806352200cdb3c848b0db42a4f" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" ADD CONSTRAINT "FK_47d21f87de265525184714fc583" FOREIGN KEY ("shop_id") REFERENCES "shop"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shop" ADD CONSTRAINT "FK_c0e0ab8d2b1c69e66474694bfdd" FOREIGN KEY ("seller_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon" ADD CONSTRAINT "FK_8b1907ebe142f1511e9033a3fc3" FOREIGN KEY ("shop_id") REFERENCES "shop"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD CONSTRAINT "FK_f5221735ace059250daac9d9803" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD CONSTRAINT "FK_cd7812c96209c5bdd48a6b858b0" FOREIGN KEY ("customer_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD CONSTRAINT "FK_aaeb48c2977647854e201cb5f68" FOREIGN KEY ("global_coupon_id") REFERENCES "coupon"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD CONSTRAINT "FK_4a3fbcf31d8e5b56e82218673d8" FOREIGN KEY ("shop_id") REFERENCES "shop"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD CONSTRAINT "FK_0dce9bc93c2d2c399982d04bef1" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variant" ADD CONSTRAINT "FK_ca67dd080aac5ecf99609960cd2" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" ADD CONSTRAINT "FK_6312e502a3cc8068671253bdbaf" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" ADD CONSTRAINT "FK_f5902b9e7772d81c94f25c4275d" FOREIGN KEY ("sub_order_id") REFERENCES "sub_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" ADD CONSTRAINT "FK_5e17c017aa3f5164cb2da5b1c6b" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_order" ADD CONSTRAINT "FK_2407b8d18a8aec90326a859b685" FOREIGN KEY ("shop_id") REFERENCES "shop"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_order" ADD CONSTRAINT "FK_45c9d44ebb019fb95e60f1b686e" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_order" ADD CONSTRAINT "FK_a19c5bd481048c0e2cc84288c40" FOREIGN KEY ("shop_coupon_id") REFERENCES "coupon"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_request" ADD CONSTRAINT "FK_20de53fc3b402094a15e36a80df" FOREIGN KEY ("sub_order_id") REFERENCES "sub_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_request" ADD CONSTRAINT "FK_267a07979243563e3d19309ecf6" FOREIGN KEY ("customer_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_request" ADD CONSTRAINT "FK_1ba35951c0cbef07fd9eb09d1a5" FOREIGN KEY ("shop_id") REFERENCES "shop"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_item" ADD CONSTRAINT "FK_aaa0d5c7ca03bfd84b7e46f93fe" FOREIGN KEY ("return_request_id") REFERENCES "return_request"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_item" ADD CONSTRAINT "FK_372b7bcda8abc00fff75d17abf1" FOREIGN KEY ("order_item_id") REFERENCES "order_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_coupon" ADD CONSTRAINT "FK_7c6528e1e0316046b312485e98f" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_coupon" ADD CONSTRAINT "FK_d46a84c0d08bce5deb0c9429357" FOREIGN KEY ("coupon_id") REFERENCES "coupon"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payout" ADD CONSTRAINT "FK_c68155fe066f7ad6516087e74b7" FOREIGN KEY ("shop_id") REFERENCES "shop"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payout" ADD CONSTRAINT "FK_794b416aaed2908059357923e11" FOREIGN KEY ("resolved_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "review" ADD CONSTRAINT "FK_81446f2ee100305f42645d4d6c2" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "review" ADD CONSTRAINT "FK_26b533e15b5f2334c96339a1f08" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "review" ADD CONSTRAINT "FK_6fb5caf1d99ffc8dab2dcbbcf62" FOREIGN KEY ("order_item_id") REFERENCES "order_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification" ADD CONSTRAINT "FK_928b7aa1754e08e1ed7052cb9d8" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_item" ADD CONSTRAINT "FK_3f1aaffa650d3e443f32459c4c5" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_item" ADD CONSTRAINT "FK_b616e11e081d5f5508398825485" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_item" ADD CONSTRAINT "FK_67a2e8406e01ffa24ff9026944e" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shop_categories" ADD CONSTRAINT "FK_2538b463070f40928e80f0d028c" FOREIGN KEY ("shop_id") REFERENCES "shop"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "shop_categories" ADD CONSTRAINT "FK_ee4fccaada563c04413b8916d07" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    // Partial unique index (thêm tay): tối đa 1 yêu cầu trả "đang mở" (requested/approved)
    // mỗi sub-order. Partial WHERE không mô tả được ở entity decorator → migration:generate
    // bỏ sót → thêm vào đây khi gộp InitialSchema để DB dựng mới vẫn có ràng buộc nghiệp vụ.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_return_request_active_per_suborder" ON "return_request" ("sub_order_id") WHERE "status" IN ('requested', 'approved')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_return_request_active_per_suborder"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shop_categories" DROP CONSTRAINT "FK_ee4fccaada563c04413b8916d07"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shop_categories" DROP CONSTRAINT "FK_2538b463070f40928e80f0d028c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_item" DROP CONSTRAINT "FK_67a2e8406e01ffa24ff9026944e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_item" DROP CONSTRAINT "FK_b616e11e081d5f5508398825485"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_item" DROP CONSTRAINT "FK_3f1aaffa650d3e443f32459c4c5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification" DROP CONSTRAINT "FK_928b7aa1754e08e1ed7052cb9d8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "review" DROP CONSTRAINT "FK_6fb5caf1d99ffc8dab2dcbbcf62"`,
    );
    await queryRunner.query(
      `ALTER TABLE "review" DROP CONSTRAINT "FK_26b533e15b5f2334c96339a1f08"`,
    );
    await queryRunner.query(
      `ALTER TABLE "review" DROP CONSTRAINT "FK_81446f2ee100305f42645d4d6c2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payout" DROP CONSTRAINT "FK_794b416aaed2908059357923e11"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payout" DROP CONSTRAINT "FK_c68155fe066f7ad6516087e74b7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_coupon" DROP CONSTRAINT "FK_d46a84c0d08bce5deb0c9429357"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_coupon" DROP CONSTRAINT "FK_7c6528e1e0316046b312485e98f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_item" DROP CONSTRAINT "FK_372b7bcda8abc00fff75d17abf1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_item" DROP CONSTRAINT "FK_aaa0d5c7ca03bfd84b7e46f93fe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_request" DROP CONSTRAINT "FK_1ba35951c0cbef07fd9eb09d1a5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_request" DROP CONSTRAINT "FK_267a07979243563e3d19309ecf6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_request" DROP CONSTRAINT "FK_20de53fc3b402094a15e36a80df"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_order" DROP CONSTRAINT "FK_a19c5bd481048c0e2cc84288c40"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_order" DROP CONSTRAINT "FK_45c9d44ebb019fb95e60f1b686e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_order" DROP CONSTRAINT "FK_2407b8d18a8aec90326a859b685"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" DROP CONSTRAINT "FK_5e17c017aa3f5164cb2da5b1c6b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" DROP CONSTRAINT "FK_f5902b9e7772d81c94f25c4275d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" DROP CONSTRAINT "FK_6312e502a3cc8068671253bdbaf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variant" DROP CONSTRAINT "FK_ca67dd080aac5ecf99609960cd2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP CONSTRAINT "FK_0dce9bc93c2d2c399982d04bef1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP CONSTRAINT "FK_4a3fbcf31d8e5b56e82218673d8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP CONSTRAINT "FK_aaeb48c2977647854e201cb5f68"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP CONSTRAINT "FK_cd7812c96209c5bdd48a6b858b0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" DROP CONSTRAINT "FK_f5221735ace059250daac9d9803"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupon" DROP CONSTRAINT "FK_8b1907ebe142f1511e9033a3fc3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shop" DROP CONSTRAINT "FK_c0e0ab8d2b1c69e66474694bfdd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" DROP CONSTRAINT "FK_47d21f87de265525184714fc583"`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" DROP CONSTRAINT "FK_a806352200cdb3c848b0db42a4f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category" DROP CONSTRAINT "FK_1117b4fcb3cd4abb4383e1c2743"`,
    );
    await queryRunner.query(
      `ALTER TABLE "address" DROP CONSTRAINT "FK_35cd6c3fafec0bb5d072e24ea20"`,
    );
    await queryRunner.query(
      `ALTER TABLE "session" DROP CONSTRAINT "FK_30e98e8746699fb9af235410aff"`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_token" DROP CONSTRAINT "FK_b007d3e37939a8856da8ddb90ca"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ee4fccaada563c04413b8916d0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2538b463070f40928e80f0d028"`,
    );
    await queryRunner.query(`DROP TABLE "shop_categories"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_03de0ba44e04c2127122a353b3"`,
    );
    await queryRunner.query(`DROP TABLE "cart_item"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_00854909abbcebd77dabb4335e"`,
    );
    await queryRunner.query(`DROP TABLE "notification"`);
    await queryRunner.query(`DROP TYPE "public"."notification_type_enum"`);
    await queryRunner.query(`DROP TABLE "review"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_06f372d2d5b1c6e18ceb91cdf7"`,
    );
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
    await queryRunner.query(
      `DROP TYPE "public"."idempotency_keys_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE "outbox_event"`);
    await queryRunner.query(`DROP TYPE "public"."outbox_event_status_enum"`);
    await queryRunner.query(`DROP TABLE "payout"`);
    await queryRunner.query(`DROP TYPE "public"."payout_status_enum"`);
    await queryRunner.query(`DROP TABLE "user_coupon"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_372b7bcda8abc00fff75d17abf"`,
    );
    await queryRunner.query(`DROP TABLE "return_item"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cd30857d0be5fa9060d7971726"`,
    );
    await queryRunner.query(`DROP TABLE "return_request"`);
    await queryRunner.query(`DROP TYPE "public"."return_request_reason_enum"`);
    await queryRunner.query(`DROP TYPE "public"."return_request_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3b4da947c6971422b52e1de436"`,
    );
    await queryRunner.query(`DROP TABLE "sub_order"`);
    await queryRunner.query(`DROP TYPE "public"."sub_order_status_enum"`);
    await queryRunner.query(`DROP TABLE "order_item"`);
    await queryRunner.query(`DROP TABLE "product_variant"`);
    await queryRunner.query(`DROP TABLE "product"`);
    await queryRunner.query(`DROP TYPE "public"."product_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ad3284c37a2eb7da1b5090b2c2"`,
    );
    await queryRunner.query(`DROP TABLE "order"`);
    await queryRunner.query(`DROP TYPE "public"."order_status_enum"`);
    await queryRunner.query(`DROP TABLE "payment"`);
    await queryRunner.query(`DROP TYPE "public"."payment_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."payment_method_enum"`);
    await queryRunner.query(`DROP TABLE "coupon"`);
    await queryRunner.query(`DROP TYPE "public"."coupon_discount_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."coupon_type_enum"`);
    await queryRunner.query(`DROP TABLE "shop"`);
    await queryRunner.query(`DROP TYPE "public"."shop_status_enum"`);
    await queryRunner.query(`DROP TABLE "media_assets"`);
    await queryRunner.query(`DROP TYPE "public"."media_assets_type_enum"`);
    await queryRunner.query(`DROP TABLE "category"`);
    await queryRunner.query(`DROP TABLE "address"`);
    await queryRunner.query(`DROP TABLE "session"`);
    await queryRunner.query(`DROP TABLE "verification_token"`);
    await queryRunner.query(
      `DROP TYPE "public"."verification_token_type_enum"`,
    );
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TYPE "public"."user_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
  }
}
