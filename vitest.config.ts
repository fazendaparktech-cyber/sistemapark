import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` impede import pelo navegador no Next; nos testes, o código já roda no servidor.
      'server-only': fileURLToPath(new URL('./tests/helpers/server-only.ts', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/helpers/global-setup.ts'],
          setupFiles: ['tests/helpers/setup-integration.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
