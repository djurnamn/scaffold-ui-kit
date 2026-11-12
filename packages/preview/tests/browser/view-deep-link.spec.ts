// Custom views in the charcell shell: a view's iframe, titled by the view's
// id, mounts when the view is chosen in the navigation or named by `?view=`,
// and a view deep-links into a component story through its context. Run with
// `pnpm test:e2e`.
import { expect, test } from '@playwright/test';
import { openHost, paneBody } from './support/host';

test.describe('Custom views', () => {
  test('a gallery button opens the Glyph story on that glyph', async ({ page }) => {
    await openHost(page);
    await page.getByRole('navigation').getByText('Gallery', { exact: true }).click();

    // The buttons render once the catalog has told the view which story to link to.
    const gallery = page.frameLocator('iframe[title="glyph-gallery"]');
    const cross = gallery.getByRole('button', { name: 'cross', exact: true });
    await expect(cross).toBeVisible({ timeout: 30_000 });
    await cross.click();

    // The host leaves the view for the component stage, on the clicked glyph.
    await expect(page.locator('iframe[title="glyph-gallery"]')).toHaveCount(0);
    await expect(page.getByTestId('select-component')).toHaveValue('Glyph');
    await expect(paneBody(page, 'react').locator('.FixtureGlyph')).toHaveText('cross', { timeout: 30_000 });
    await expect(page).toHaveURL(/[?&]component=components-glyph(&|$)/);
  });

  test('?view= opens a view, and the view iframe follows the navigation', async ({ page }) => {
    await page.goto('/?view=swatches');
    const swatches = page.frameLocator('iframe[title="swatches"]');
    await expect(swatches.locator('body')).toContainText('mode: light', { timeout: 60_000 });
    // No target pane shows while a view is selected.
    await expect(page.locator('iframe[title="react"]')).toHaveCount(0);

    await page.getByRole('navigation').getByText('Gallery', { exact: true }).click();
    await expect(page.locator('iframe[title="swatches"]')).toHaveCount(0);
    await expect(page.locator('iframe[title="glyph-gallery"]')).toHaveCount(1);
    await expect(page).toHaveURL(/[?&]view=glyph-gallery(&|$)/);
  });
});
