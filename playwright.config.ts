import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['COFRADIA_FRONTEND_URL'] ?? 'http://localhost:4300';
// El servidor de desarrollo se arranca en el puerto del baseURL (antes estaba
// fijado a 4300 y un COFRADIA_FRONTEND_URL distinto dejaba al webServer colgado).
const puerto = new URL(baseURL).port || '4300';

export default defineConfig({
  testDir: './e2e/pruebas',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run start -- --port ${puerto}`,
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
