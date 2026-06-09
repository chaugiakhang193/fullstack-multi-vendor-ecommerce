import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScopeIdempotencyByUser1780836800000 implements MigrationInterface {
  name = 'ScopeIdempotencyByUser1780836800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" ADD "user_id" uuid NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" DROP COLUMN "user_id"`
    );
  }
}
