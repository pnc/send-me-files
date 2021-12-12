import { PlaywrightTestConfig, devices } from '@playwright/test';
const config: PlaywrightTestConfig = {
  webServer: {
    command: 'S3_BUCKET_ENDPOINT=send-phil-files-test-storagebucket-vgwu8ytprurq.s3.us-east-1.amazonaws.com yarn start',
    port: 1234,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },

  expect: {
    timeout: 10000
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // "Pixel 4" tests use Chromium browser.
    {
      name: 'Pixel 4',
      use: {
        browserName: 'chromium',
        ...devices['Pixel 4'],
      },
    },

    // "iPhone 11" tests use WebKit browser.
    {
      name: 'iPhone 11',
      use: {
        browserName: 'webkit',
        ...devices['iPhone 11'],
      },
    },
  ],
};
export default config;
