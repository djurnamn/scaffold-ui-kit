// The charcell shell's pane width, driven through the host page on the
// development server in a 1440 by 900 window: the `width` select among the
// output's options fits the panes to the stage, or lays every story pane out
// at one of the catalog's widths. While that width is wider than a column,
// the output stacks a row per target at the stage's full width, showing a
// 768 or 1280 layout whole where the stage has the room, and scrolling
// across, its scrollbar on a row of its own, where it has not. Each of the
// four rows starts at its story's height, the last taking what is left under
// it; stories too tall to fit share the stage equally, and with the code row
// under them the stage scrolls rather than squeezing a row under its
// readable least, while short stories and the code row fit without a
// scroll. Stories of a known height stand in for tall ones: each
// pane's page grows by a padding under the story. The address keeps the
// width, and a link opens the panes at it. Run with `pnpm test:e2e`.
import { expect, test, type Page } from '@playwright/test';
import { SCRIPTED_TARGETS, openHost, openOutputOptions, paneBody, pick, showView, type Target } from './support/host';

test.use({ viewport: { width: 1440, height: 900 } });

const TARGETS = [...SCRIPTED_TARGETS, 'html'] as const;

/** The width select, in the output's options, which it opens. */
const widthSelect = async (page: Page) => (await openOutputOptions(page)).getByTestId('select-pane-width');

/** The width a pane's story is laid out at: its document's viewport. */
const laidOutAt = (page: Page, target: (typeof TARGETS)[number]) =>
  paneBody(page, target as Target).evaluate((body) => body.ownerDocument.defaultView!.innerWidth);

/** A pane's iframe. */
const frame = (page: Page, target: string) => page.locator(`iframe[title="${target}"]`);

/** The scroll area a fixed pane's story sits in. */
const storyArea = (page: Page, target: string) => page.getByRole('region', { name: `${target} story`, exact: true });

/** Whether a pane's scroll area shows its story whole: nothing to scroll either way. */
const shownWhole = (page: Page, target: string) =>
  storyArea(page, target).evaluate(
    (viewport) => viewport.scrollWidth <= viewport.clientWidth && viewport.scrollHeight <= viewport.clientHeight,
  );

/** Each pane's iframe box, by target. */
const paneBoxes = (page: Page) => Promise.all(TARGETS.map(async (target) => (await frame(page, target).boundingBox())!));

/** Each pane's scroll area box, by target. */
const areaBoxes = (page: Page) =>
  Promise.all(TARGETS.map(async (target) => (await storyArea(page, target).boundingBox())!));

/** Make a pane's story a known height taller, by a padding under it in its page. */
const growStory = (page: Page, target: (typeof TARGETS)[number], pixels: number) =>
  paneBody(page, target as Target).evaluate((body, padding) => {
    body.style.paddingBottom = `${padding}px`;
  }, pixels);

/** The stage's one row, in pixels: the grid's line height. */
const rowHeight = (page: Page) =>
  page.locator('.PreviewGrid').evaluate((grid) => parseFloat(getComputedStyle(grid).lineHeight));

test.describe('The pane width', () => {
  test('sits among the output\'s options with the kit\'s own, not in the row', async ({ page }) => {
    await openHost(page);
    await expect(page.getByTestId('select-pane-width')).toHaveCount(0);
    const options = await openOutputOptions(page);
    await expect(options.getByTestId('select-pane-width')).toBeVisible();
    // After the kit's options in the panel.
    const controls = await options.locator('[data-testid="select-pane-width"], button, [role="checkbox"]').all();
    expect(controls.length).toBeGreaterThan(1);
    await expect(controls.at(-1)!).toHaveAttribute('data-testid', 'select-pane-width');
  });

  test('closes only its list on Escape, leaving the options open', async ({ page }) => {
    await openHost(page);
    const options = await openOutputOptions(page);
    await options.getByTestId('select-pane-width').click();
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(options).toBeVisible();
  });

  test('stacks the targets as full-width rows at a width wider than a column, showing a 768 layout whole', async ({
    page,
  }) => {
    await openHost(page);
    await expect(await widthSelect(page)).toHaveText(/fit/);
    // Fitted, the panes sit side by side.
    expect(new Set((await paneBoxes(page)).map((box) => Math.round(box.y))).size).toBe(1);
    const fittedWidth = await laidOutAt(page, 'react');
    expect(fittedWidth).toBeLessThan(768);

    await pick(await widthSelect(page), 'medium 768');
    await expect(page).toHaveURL(/[?&]width=768(&|$)/);
    await expect(page.locator('.PreviewGrid[data-stacked]')).toHaveCount(1);
    const grid = (await page.locator('.PreviewGrid').boundingBox())!;
    for (const target of TARGETS) {
      await expect.poll(() => laidOutAt(page, target)).toBe(768);
      // Each row is the stage's width, and the story in it shows whole.
      const area = (await storyArea(page, target).boundingBox())!;
      expect(area.width).toBeGreaterThan(grid.width * 0.9);
      await expect.poll(() => shownWhole(page, target)).toBe(true);
    }
    // One row per target, top to bottom.
    const stacked = await paneBoxes(page);
    for (let i = 1; i < stacked.length; i++)
      expect(stacked[i].y).toBeGreaterThanOrEqual(stacked[i - 1].y + stacked[i - 1].height);

    await pick(await widthSelect(page), 'fit');
    await expect(page).not.toHaveURL(/[?&]width=/);
    await expect(page.locator('.PreviewGrid[data-stacked]')).toHaveCount(0);
    await expect.poll(() => laidOutAt(page, 'react')).toBe(fittedWidth);
  });

  test('shows a 1280 layout whole without the navigation, and scrolls across it beside the navigation', async ({ page }) => {
    await openHost(page, '/?width=1280&option.shell.navigation=false');
    await expect(await widthSelect(page)).toHaveText(/large 1280/);
    for (const target of TARGETS) {
      await expect.poll(() => laidOutAt(page, target)).toBe(1280);
      await expect.poll(() => shownWhole(page, target)).toBe(true);
    }

    await openHost(page, '/?width=1280');
    await expect.poll(() => laidOutAt(page, 'react')).toBe(1280);
    const area = storyArea(page, 'react');
    await expect.poll(() => area.evaluate((viewport) => viewport.scrollWidth > viewport.clientWidth)).toBe(true);
    // The scrollbar takes a row of its own under the story, which the row
    // starting at its content makes room for: the story is not cut short.
    await expect(area.locator('xpath=../*[contains(@class, "__horizontal-bar")]')).toBeVisible();
    await expect
      .poll(async () => {
        const viewport = (await area.boundingBox())!;
        const iframe = (await frame(page, 'react').boundingBox())!;
        return iframe.y + iframe.height <= viewport.y + viewport.height + 0.5;
      })
      .toBe(true);
  });

  test("opens a link at a width that is not among the catalog's", async ({ page }) => {
    await openHost(page, '/?width=500');
    await expect(await widthSelect(page)).toHaveText(/500/);
    await expect.poll(() => laidOutAt(page, 'svelte')).toBe(500);
  });

  for (const [label, width] of [
    ['medium 768', 768],
    ['large 1280', 1280],
  ] as const) {
    test(`starts each of four stacked rows at its story's height at ${label}`, async ({ page }) => {
      await openHost(page, `/?width=${width}&option.shell.navigation=false`);
      await expect(page.locator('.PreviewGrid[data-stacked]')).toHaveCount(1);
      const row = await rowHeight(page);
      // Stories of different heights that fit the stage together.
      const growth = [0, 160, 40, 100];
      for (const [index, target] of TARGETS.entries()) await growStory(page, target, growth[index]);
      await expect
        .poll(async () => {
          const areas = await areaBoxes(page);
          const frames = await paneBoxes(page);
          // No row above the last is taller than its story, or shorter.
          return areas.slice(0, -1).every((area, index) => Math.abs(area.height - frames[index].height) < row);
        })
        .toBe(true);
      // The last row takes what is left: it shows its story whole.
      await expect.poll(() => shownWhole(page, 'html')).toBe(true);
      for (const target of TARGETS) await expect.poll(() => shownWhole(page, target)).toBe(true);
    });

    test(`fits four short stacked stories and the code row without scrolling at ${label}`, async ({ page }) => {
      await openHost(page, `/?width=${width}&option.shell.navigation=false`);
      await showView(page, 'code');
      await expect(page.locator('.PreviewGrid[data-stacked]')).toHaveCount(1);
      const row = await rowHeight(page);
      const grid = page.locator('.PreviewGrid');
      await expect
        .poll(async () => {
          const areas = await areaBoxes(page);
          const frames = await paneBoxes(page);
          return areas.every((area, index) => Math.abs(area.height - frames[index].height) < row);
        })
        .toBe(true);
      // Nothing to scroll, and the code row has at least its share.
      expect(await grid.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
      const code = (await page.locator('[data-preview-code="react"]').boundingBox())!;
      const stage = (await grid.boundingBox())!;
      expect(code.height).toBeGreaterThan(stage.height * 0.3 - 4 * row);
    });

    test(`shares the stage equally between four stacked stories too tall to fit at ${label}`, async ({ page }) => {
      await openHost(page, `/?width=${width}&option.shell.navigation=false`);
      await expect(page.locator('.PreviewGrid[data-stacked]')).toHaveCount(1);
      const row = await rowHeight(page);
      for (const target of TARGETS) await growStory(page, target, 600);
      const stage = (await page.locator('.PreviewGrid').boundingBox())!;
      // An equal share of the stage for each row, once they settle.
      await expect
        .poll(async () => {
          const heights = (await areaBoxes(page)).map((area) => area.height);
          return (
            Math.max(...heights) - Math.min(...heights) <= row + 1 &&
            heights.every((height) => height > stage.height / 4 - 4 * row)
          );
        })
        .toBe(true);
      for (const target of TARGETS)
        await expect
          .poll(() => storyArea(page, target).evaluate((viewport) => viewport.scrollHeight > viewport.clientHeight))
          .toBe(true);

      // With the code row under them, the rows keep their readable least and
      // the stage scrolls down to the code rather than squeezing them.
      await showView(page, 'code');
      const grid = page.locator('.PreviewGrid');
      await expect.poll(() => grid.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
      // Each row keeps ten rows: its ring, the scrollbar row at 1280, and
      // the story's seven or more.
      for (const area of await areaBoxes(page)) expect(area.height).toBeGreaterThanOrEqual(7 * row - 1);
      await grid.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      await expect(page.getByRole('main').getByText('code', { exact: true }).first()).toBeInViewport();
    });
  }
});
