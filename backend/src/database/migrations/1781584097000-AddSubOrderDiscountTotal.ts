import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubOrderDiscountTotal1781584097000 implements MigrationInterface {
  name = 'AddSubOrderDiscountTotal1781584097000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sub_order" ADD "discount_amount" numeric(12,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_order" ADD "total_amount" numeric(12,2)`,
    );

    // Backfill best-effort: discount từ shop_coupon CÒN gắn (fallback 0), total = sub - discount + ship.
    const rows: Array<{
      id: string;
      sub_total: string | null;
      shipping_fee: string | null;
      discount_type: string | null;
      discount_value: string | null;
      max_discount_value: string | null;
    }> = await queryRunner.query(`
      SELECT so.id, so.sub_total, so.shipping_fee,
             c.discount_type, c.discount_value, c.max_discount_value
      FROM "sub_order" so
      LEFT JOIN "coupon" c ON c.id = so.shop_coupon_id
    `);

    for (const r of rows) {
      const subTotal = Number(r.sub_total ?? 0);
      const shippingFee = Number(r.shipping_fee ?? 0);
      let discount = 0;
      if (r.discount_type) {
        const value = Number(r.discount_value ?? 0);
        // Note: DiscountType in codebase enum is lowercase 'percentage' / 'fixed_amount'
        const raw = r.discount_type === 'percentage' ? (subTotal * value) / 100
                  : r.discount_type === 'fixed_amount' ? value : 0;
        const cap = r.max_discount_value != null ? Number(r.max_discount_value) : Number.POSITIVE_INFINITY;
        discount = Math.max(0, Math.min(raw, cap, subTotal));
      }
      const total = Math.round((subTotal - discount + shippingFee) * 100) / 100;
      await queryRunner.query(
        `UPDATE "sub_order" SET "discount_amount" = $1, "total_amount" = $2 WHERE "id" = $3`,
        [discount, total, r.id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sub_order" DROP COLUMN "total_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_order" DROP COLUMN "discount_amount"`,
    );
  }
}
