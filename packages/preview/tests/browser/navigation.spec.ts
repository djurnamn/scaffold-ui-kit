// The charcell shell's navigation: the prompt bar's toggle hides it and shows it
// again, the stage takes the body's width while it is hidden, and the address
// keeps it hidden through a reload. Too long for the window, the navigation
// scrolls in its charcell ScrollArea, a whole row per arrow key. Run with
// `pnpm test:e2e`.
import { expect, test, type Page } from '@playwright/test';
import { openHost } from './support/host';

/** The navigation toggle in the prompt bar: the element to click. */
const navigationToggle = (page: Page) =>
  page.getByRole('checkbox', { name: 'navigation', exact: true }).locator('xpath=..');

const navigation = (page: Page) => page.getByRole('treeitem', { name: 'Button', exact: true });

test.describe('The navigation', () => {
  test('hides and shows from the prompt bar, the stage taking its width', async ({ page }) => {
    await openHost(page);
    await expect(navigation(page)).toBeVisible();
    const stageWidth = () => page.getByRole('main').evaluate((element) => element.getBoundingClientRect().width);
    const shown = await stageWidth();
    await navigationToggle(page).click();
    await expect(navigation(page)).toHaveCount(0);
    await expect(page).toHaveURL(/[?&]option\.shell\.navigation=false(&|$)/);
    expect(await stageWidth()).toBeGreaterThan(shown);
    await navigationToggle(page).click();
    await expect(navigation(page)).toBeVisible();
    await expect(page).not.toHaveURL(/option\.shell\.navigation/);
  });

  test('resizes from its handle a column at a time, down to sixteen columns', async ({ page }) => {
    await openHost(page);
    const handle = page.getByRole('separator', { name: 'resize navigation' });
    const navigation = page.locator('.Navigation');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const column = await navigation.evaluate((element) => {
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;width:1ch';
      element.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    });
    const width = () => navigation.evaluate((element) => element.getBoundingClientRect().width);
    await expect.poll(width).toBe(27 * column);
    await handle.focus();
    for (const [key, columns] of [
      ['ArrowRight', 1],
      ['ArrowLeft', -1],
      ['ArrowLeft', -1],
    ] as const) {
      const before = await width();
      await page.keyboard.press(key);
      await expect.poll(width).toBe(before + columns * column);
    }
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
    await expect.poll(width).toBe(16 * column);
  });

  test('keeps its columns when the window resizes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await openHost(page);
    const width = () => page.locator('.Navigation').evaluate((element) => element.getBoundingClientRect().width);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const before = await width();
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect.poll(width).toBe(before);
    await page.setViewportSize({ width: 1600, height: 800 });
    await expect.poll(width).toBe(before);
  });

  test('scrolls a whole row per arrow key when the window is too short for it', async ({ page }) => {
    // The fixture kit's navigation is short: a short window makes it scroll.
    await page.setViewportSize({ width: 1440, height: 200 });
    await openHost(page);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const area = page.getByRole('region', { name: 'components' });
    const row = await area.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight));
    const offset = () => area.evaluate((element) => element.scrollTop);
    expect(await area.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThanOrEqual(2 * row);
    expect(await offset()).toBe(0);
    await area.focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(offset).toBe(row);
    await page.keyboard.press('ArrowDown');
    await expect.poll(offset).toBe(2 * row);
    await page.keyboard.press('ArrowUp');
    await expect.poll(offset).toBe(row);
    // To the end: the range is whole rows, so the last offset is one too.
    await page.keyboard.press('End');
    const end = await area.evaluate((element) => element.scrollHeight - element.clientHeight);
    await expect.poll(offset).toBe(end);
    expect(end % row).toBe(0);
  });

  test('opens with the selected entry in the middle of its scrolling navigation', async ({ page }) => {
    // Short enough that the navigation scrolls, Swatches its last entry.
    await page.setViewportSize({ width: 1440, height: 200 });
    await page.goto('/?view=swatches');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const area = page.getByRole('region', { name: 'components' });
    const selected = area.locator('[aria-current]');
    await expect(selected).toHaveText('Swatches');
    const placement = await selected.evaluate((element) => {
      const region = element.closest('[role="region"]')!;
      const box = element.getBoundingClientRect();
      const frame = region.getBoundingClientRect();
      return { top: box.top - frame.top, bottom: frame.bottom - box.bottom, scrolled: region.scrollTop };
    });
    // Scrolled, and the entry in view with room on both sides as the end of the list allows.
    expect(placement.scrolled).toBeGreaterThan(0);
    expect(placement.top).toBeGreaterThan(0);
    expect(placement.bottom).toBeGreaterThanOrEqual(0);
  });

  test('stays hidden through a reload', async ({ page }) => {
    await openHost(page, '/?component=components-tag&option.shell.navigation=false');
    await expect(navigation(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('select-component')).toHaveValue('Tag', { timeout: 60_000 });
    await expect(navigation(page)).toHaveCount(0);
  });
});
