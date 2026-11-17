import { devices, type PlaywrightTestConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

// A slow server (a local one under load needs more than 30 s for some form saves and visit-page loads) needs longer timeouts: E2E_TIMEOUT_FACTOR
// multiplies the test, expect and action timeouts. 1 (the default) is the setting for kgh-ci and kgh-demo.
const factor = Number(process.env.E2E_TIMEOUT_FACTOR ?? 1);

const config: PlaywrightTestConfig = {
  testDir: './specs',
  timeout: 30 * 1000 * factor,
  expect: {
    timeout: 15 * 1000 * factor,
  },
  fullyParallel: true,
  // One worker by default: the specs create and purge their own patients on a shared server. E2E_WORKERS=3 runs
  // specs in parallel (each test has its own patient), if the server can take it.
  workers: Number(process.env.E2E_WORKERS ?? 1),
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['junit', { outputFile: 'results.xml' }], ['html']] : [['html', { open: 'never' }]],
  globalSetup: require.resolve('./core/global-setup'),
  use: {
    // Trailing slash is required so that relative page.goto() paths keep the "/openmrs" prefix.
    baseURL: `${process.env.E2E_BASE_URL}/`,
    actionTimeout: 15 * 1000 * factor,
    storageState: 'storageState.json',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
};

export default config;
