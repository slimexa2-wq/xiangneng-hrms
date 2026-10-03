import { fileURLToPath } from 'node:url';

export default {
  resolve: {
    alias: {
      vitest: fileURLToPath(new URL('../../apps/api/node_modules/vitest/dist/index.js', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: [fileURLToPath(new URL('./recruitment.integration.test.ts', import.meta.url))],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
};
