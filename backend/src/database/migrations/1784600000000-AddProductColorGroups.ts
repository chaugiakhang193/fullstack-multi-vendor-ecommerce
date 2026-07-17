import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gộp metadata ảnh + màu về 1 nguồn sự thật: product.color_groups jsonb
 *   { "Đỏ": { "hex": "#ef4444"|null, "images": [urls] } }
 * thay cho color_images cũ ({ "Đỏ": [urls] }). Backfill dữ liệu hiện có
 * (hex = null), rồi drop cột color_images. down() đảo ngược (rút images ra lại).
 */
export class AddProductColorGroups1784600000000 implements MigrationInterface {
  name = 'AddProductColorGroups1784600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product" ADD "color_groups" jsonb`);
    // Chuyển { màu: [urls] } → { màu: { hex: null, images: [urls] } }.
    await queryRunner.query(`
      UPDATE "product"
      SET "color_groups" = (
        SELECT jsonb_object_agg(
          e.key,
          jsonb_build_object('hex', NULL, 'images', e.value)
        )
        FROM jsonb_each("color_images") AS e
      )
      WHERE "color_images" IS NOT NULL
    `);
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "color_images"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product" ADD "color_images" jsonb`);
    // Chuyển ngược { màu: { hex, images } } → { màu: [urls] } (bỏ hex).
    await queryRunner.query(`
      UPDATE "product"
      SET "color_images" = (
        SELECT jsonb_object_agg(e.key, e.value->'images')
        FROM jsonb_each("color_groups") AS e
      )
      WHERE "color_groups" IS NOT NULL
    `);
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "color_groups"`);
  }
}
