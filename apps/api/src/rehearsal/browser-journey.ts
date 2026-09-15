import { chromium } from '@playwright/test';
import { startFixture, type Variant } from '@codelens/taskforge';

/** Optional CI stage. Browser and target are controlled entirely by this executor. */
export async function browserJourney(variant: Variant) {
  const fixture = await startFixture(variant, { postgresUrl: process.env.TASKFORGE_DATABASE_URL });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(fixture.url, { timeout: 10_000 });
    await page.getByRole('button', { name: 'Load issues', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Issue 001' }).waitFor({ timeout: 5000 });
    const listing = await page.getByRole('status').innerText();
    await page.getByRole('button', { name: 'Open private project' }).click();
    await page.waitForFunction(
      () => {
        const text = document.querySelector('[role=status]')?.textContent;
        return text?.includes('Access denied') || text?.includes('Issue 061');
      },
      {},
      { timeout: 5000 },
    );
    const privateResult = await page.getByRole('status').innerText();
    return {
      engine: 'Playwright Chromium',
      browserVersion: browser.version(),
      variant,
      checks: [
        {
          name: 'Browser issue listing',
          outcome: listing.includes('Issue 001') ? 'passed' : 'failed',
          actual: listing,
        },
        {
          name: 'Browser private-project access',
          outcome: privateResult === 'Access denied' ? 'passed' : 'failed',
          expected: 'Access denied',
          actual: privateResult,
        },
      ],
      traces: fixture.traces,
    };
  } finally {
    await browser?.close();
    await fixture.close();
  }
}
