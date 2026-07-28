import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTraceParentToOutboxEvent1785000000000 implements MigrationInterface {
  name = 'AddTraceParentToOutboxEvent1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // NULLABLE là bắt buộc: mọi row cũ không có trace, và khi OTEL_ENABLED=false
    // thì row mới cũng không có. Không đặt default.
    await queryRunner.query(
      `ALTER TABLE "outbox_event" ADD COLUMN IF NOT EXISTS "trace_parent" character varying(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "outbox_event" DROP COLUMN IF EXISTS "trace_parent"`,
    );
  }
}
