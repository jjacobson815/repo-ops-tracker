import { defineConfig, devices } from '@playwright/test';

// Serves the fully static public/ app (no Express/Prisma). IndexedDB is real
// in-browser; ES modules load natively. Each test gets a fresh browser context
// => a fresh IndexedDB, so tests are isolated.
const PORT = process.env.PORT || '8788';

export default defineConfig({
  testDir: './test',
  testMatch: /.*\.spec\.mjs/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: 'node scripts/serve.mjs',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: { PORT }
  }
});
