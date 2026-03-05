import { test, expect } from '@playwright/test';

import { startTestStack } from '../support/test-stack';

test.describe('igloo-web v2 smoke', () => {
  let stack: Awaited<ReturnType<typeof startTestStack>>;

  test.beforeAll(async () => {
    stack = await startTestStack(20_000);
  });

  test.afterAll(async () => {
    await stack.stop();
  });

test('onboards and reaches signer screen through local relay/peer', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Continue to Setup' }).click();
    await page.getByPlaceholder('e.g. Laptop Signer, Browser Node A').fill('E2E Browser Signer');
    await page.getByPlaceholder('bfonboard1...').fill(stack.fixture.onboardingPackage);
    await page.getByPlaceholder('wss://relay.example.com').fill(stack.fixture.relayUrl);
    await page.getByRole('button', { name: 'Connect and Continue' }).click();
    await expect(page.getByText('Peer List')).toBeVisible();
    const stopButton = page.getByRole('button', { name: 'Stop Signer' });
    if ((await stopButton.count()) === 0) {
      await page.getByRole('button', { name: 'Start Signer' }).click();
      await expect(page.getByText(/Signer (Running|Stopped)/)).toBeVisible({ timeout: 15_000 });
    }

    await expect(page.getByLabel('Ping').first()).toBeVisible();
    await page.getByLabel('Policy controls').first().click();
    const outboundButton = page
      .getByRole('button', { name: /Outbound (Allow|Block)/ })
      .first();
    const before = await outboundButton.textContent();
    await outboundButton.click();
    await expect(outboundButton).not.toHaveText(before ?? '');
  });
});
