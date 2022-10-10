// example.spec.ts
import { test, expect } from '@playwright/test';

test.describe('feature foo', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    // Go to the starting url before each test.
    await page.goto(baseURL!);
  });

  test('my test', async ({ page }) => {
    page.on('pageerror', exception => {
      console.log(`Uncaught exception: "${exception}"`);
    });

    expect(await page.screenshot({scale: 'css'})).toMatchSnapshot('test/landing.png');
    await page.setInputFiles('input', 'yarn.lock');
    await expect(page.locator('.card-file .card-subtitle')).toHaveText('Sent successfully. I have your file!');
    expect(await page.screenshot({scale: 'css'})).toMatchSnapshot('test/succeeded.png');
  });
});
