// A story whose content is a part that calls itself: the fixture kit's
// unlisted Outline story fills its slot with Branch, which lists its items as
// Tags and calls itself for each item's children. Every target pane and
// the html pane draw the whole tree, three levels deep, ending at each empty
// list. Run with `pnpm test:e2e`.
import { expect, test } from '@playwright/test';
import { SCRIPTED_TARGETS, paneBody } from './support/host';

// Each name the tree holds, depth first, and one list per item plus the root's.
const NAMES = ['docs', 'guides', 'install', 'src'];

test.describe('A part', () => {
  test('draws a tree to the depth of its data in every pane', async ({ page }) => {
    await page.goto('/?component=components-outline');
    for (const target of SCRIPTED_TARGETS) {
      const outline = paneBody(page, target).locator('.FixtureOutline');
      await expect(outline.locator('.FixtureTag')).toHaveText(NAMES, { timeout: 60_000 });
      await expect(outline.locator('.FixtureBranch')).toHaveCount(NAMES.length + 1);
      // install sits three lists deep.
      await expect(outline.locator('.FixtureBranch .FixtureBranch .FixtureBranch .FixtureTag')).toHaveText('install');
    }
    const html = page.frameLocator('iframe[title="html"]').locator('#app');
    await expect(html.locator('.FixtureTag')).toHaveText(NAMES, { timeout: 60_000 });
    await expect(html.locator('.FixtureBranch')).toHaveCount(NAMES.length + 1);
  });
});
