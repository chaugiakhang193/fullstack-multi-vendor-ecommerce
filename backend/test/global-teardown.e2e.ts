/**
 * Jest globalTeardown cho e2e: huỷ container Postgres ephemeral do global-setup.e2e.ts dựng.
 */
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

module.exports = async function globalTeardown(): Promise<void> {
  const container = (globalThis as Record<string, unknown>)
    .__E2E_PG_CONTAINER__ as StartedPostgreSqlContainer | undefined;
  if (container) {
    await container.stop();
    console.log('[e2e] Đã huỷ Postgres ephemeral.');
  }
};
