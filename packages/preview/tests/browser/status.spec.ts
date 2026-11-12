// The charcell shell's status bar, keys, narrow layout and pane actions: the
// status bar says how the panes stand and copies the preview's address; the
// keys toggle the views, the targets, the navigation and wrapping, open the
// component select and list themselves; a narrow window shows one view and
// one target at a time, leaving the address and giving them back once
// widened; a toggle's hint opens on the pointer; a pane reloads, and opens
// its story in a window of its own. Run with `pnpm test:e2e`.
import { expect, test, type Page } from '@playwright/test';
import { SCRIPTED_TARGETS, clickToggle, openHost, paneBody, viewToggle } from './support/host';

const status = (page: Page) => page.locator('.Bar--status').getByRole('status');
const checked = (page: Page, group: 'views' | 'targets', name: string) =>
  page.getByRole('group', { name: group }).getByRole('checkbox', { name, exact: true });

test.describe('The status bar', () => {
  test('says the panes are ready, and copies the address of what the preview shows', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openHost(page, '/?component=components-tag&option.shell.code=true');
    await expect(status(page)).toHaveText('ready');
    await page.locator('.Bar--status').getByRole('button', { name: 'copy link' }).click();
    await expect(page.locator('.Bar--status').getByRole('button', { name: 'link copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  });
});

test.describe('The component picker', () => {
  test("gives its text charcell's 20 cells while every name fits them, and shows the selected name whole", async ({ page }) => {
    await openHost(page, '/?component=components-iconlabel');
    const input = page.getByTestId('select-component');
    await expect(input).toHaveValue('IconLabel');
    await expect(input).toHaveAttribute('title', 'IconLabel');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const { cells, overflows } = await input.evaluate((element: HTMLInputElement) => {
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;width:1ch';
      element.parentElement!.append(probe);
      const cell = probe.getBoundingClientRect().width;
      probe.remove();
      return { cells: element.getBoundingClientRect().width / cell, overflows: element.scrollWidth > element.clientWidth };
    });
    expect(cells).toBeCloseTo(20, 1);
    expect(overflows).toBe(false);
  });
});

test.describe('The page', () => {
  test('says it is loading until the shell mounts, then gives way to it', async ({ page }) => {
    await page.route('**/host/main.ts*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });
    await page.goto('/?component=components-tag', { waitUntil: 'commit' });
    const note = page.locator('.PreviewPageLoading');
    await expect(note).toBeAttached();
    await expect(note).toHaveAttribute('role', 'status');
    // The note is set in charcell's face, which the page preloads, and sits
    // on a whole cell counted from the page's corner.
    await expect
      .poll(() =>
        note.evaluate(
          (element) => getComputedStyle(element, '::after').visibility
        )
      )
      .toBe('visible');
    const placed = await note.evaluate(async (element) => {
      await document.fonts.ready;
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;width:1ch';
      element.append(probe);
      const cell = probe.getBoundingClientRect().width;
      probe.remove();
      const style = getComputedStyle(element, '::after');
      return {
        face: document.fonts.check('14px "Charcell Overpass Mono"'),
        family: style.fontFamily,
        cell,
        across: parseFloat(style.left) / cell,
        down: parseFloat(style.top) / (cell * 2),
      };
    });
    expect(placed.face).toBe(true);
    expect(placed.family).toContain('Charcell Overpass Mono');
    expect(placed.cell).toBe(8);
    expect(Number.isInteger(placed.across)).toBe(true);
    expect(Number.isInteger(placed.down)).toBe(true);
    await expect(page.getByRole('main')).toBeVisible();
    // The shell mounts over the note and its styles.
    await expect(note).toHaveCount(0);
    await expect(page.locator('#root > style')).toHaveCount(0);
  });
});

test.describe('The keys', () => {
  test('toggle the views, the targets, the navigation and wrapping, and list themselves', async ({ page }) => {
    await openHost(page, '/?component=components-tag');
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.keyboard.press('c');
    await expect(checked(page, 'views', 'code')).toBeChecked();
    await expect(page).toHaveURL(/[?&]option\.shell\.code=true(&|$)/);
    await page.keyboard.press('2');
    await expect(checked(page, 'targets', 'vue')).not.toBeChecked();
    await page.keyboard.press('w');
    await expect(page).toHaveURL(/[?&]option\.shell\.wrap=false(&|$)/);
    await page.keyboard.press('n');
    await expect(page.getByRole('treeitem', { name: 'Tag', exact: true })).toHaveCount(0);
    await page.keyboard.press('n');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'keys' })).toContainText('find a component');
    // The target keys number the kit's targets: the fixture kit's four.
    await expect(page.getByRole('dialog', { name: 'keys' }).locator('dt')).toContainText(['1-4']);
    await page.keyboard.press('Escape');
    // Closed, the list hands the focus back to its button; wait for it.
    await expect(page.getByRole('dialog', { name: 'keys' })).toHaveCount(0);
    await expect(page.locator('.Bar--status').getByRole('button', { name: '? keys' })).toBeFocused();
    // `/` opens the component combobox; what is typed then replaces the name
    // and narrows the list, and a key typed there is the combobox's.
    await page.keyboard.press('/');
    await page.keyboard.type('ico');
    await expect(page.getByRole('option', { name: 'IconLabel', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Glyph', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('leave typing alone', async ({ page }) => {
    await openHost(page, '/?component=components-tag&option.shell.scenario=true');
    await page.locator('[data-preview-editor]').getByRole('textbox').first().fill('scope');
    await expect(checked(page, 'views', 'scenario')).toBeChecked();
    await expect(checked(page, 'views', 'code')).not.toBeChecked();
  });
});

test.describe('A narrow window', () => {
  test('shows one view and one target at a time', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 700 });
    await page.goto('/?component=components-tag&option.shell.code=true');
    await expect(paneBody(page, 'react')).toContainText('Active', { timeout: 60_000 });
    // Narrowed to the first of each.
    await expect(checked(page, 'views', 'output')).toBeChecked();
    await expect(checked(page, 'views', 'code')).not.toBeChecked();
    await expect(checked(page, 'targets', 'react')).toBeChecked();
    for (const target of SCRIPTED_TARGETS.filter((target) => target !== 'react'))
      await expect(checked(page, 'targets', target)).not.toBeChecked();
    // Turning one on turns the others off; the one showing stays on.
    await clickToggle(page.getByRole('group', { name: 'targets' }).getByText('vue', { exact: true }));
    await expect(checked(page, 'targets', 'vue')).toBeChecked();
    await expect(checked(page, 'targets', 'react')).not.toBeChecked();
    await clickToggle(page.getByRole('group', { name: 'targets' }).getByText('vue', { exact: true }));
    await expect(checked(page, 'targets', 'vue')).toBeChecked();
    await clickToggle(viewToggle(page, 'code'));
    await expect(checked(page, 'views', 'code')).toBeChecked();
    await expect(checked(page, 'views', 'output')).not.toBeChecked();
  });

  test('leaves the address as it was opened, and shows every view and target again once widened', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 700 });
    await page.goto('/?component=components-tag&option.shell.code=true');
    await expect(paneBody(page, 'react')).toContainText('Active', { timeout: 60_000 });
    await expect(checked(page, 'views', 'code')).not.toBeChecked();
    expect(new URL(page.url()).search).toBe('?component=components-tag&option.shell.code=true');
    await page.setViewportSize({ width: 1440, height: 700 });
    await expect(checked(page, 'views', 'output')).toBeChecked();
    await expect(checked(page, 'views', 'code')).toBeChecked();
    for (const target of SCRIPTED_TARGETS) await expect(checked(page, 'targets', target)).toBeChecked();
    expect(new URL(page.url()).search).toBe('?component=components-tag&option.shell.code=true');
  });
});

test.describe("A toggle's hint", () => {
  test('opens as the pointer rests on the toggle, as it does on focus', async ({ page }) => {
    await openHost(page, '/?component=components-tag');
    await page.getByRole('checkbox', { name: 'navigation', exact: true }).locator('xpath=..').hover();
    await expect(page.getByText('the components and views', { exact: true })).toBeVisible();
  });
});

test.describe('A pane', () => {
  test('reloads, and opens its story as it is in a window of its own', async ({ page }) => {
    await openHost(page, '/?component=components-tag');
    const frame = (name: string) => page.locator('.PreviewPane').filter({ has: page.locator(`iframe[title="${name}"]`) });
    await page.getByRole('main').getByRole('button', { name: 'reload' }).first().click();
    await expect(paneBody(page, 'react')).toContainText('Active', { timeout: 60_000 });
    await expect(status(page)).toHaveText('ready');
    // The html pane reloads but does not open on its own.
    expect(await frame('html').count()).toBe(1);
    const [opened] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('main').getByRole('button', { name: 'open' }).nth(1).click(),
    ]);
    await expect(opened).toHaveURL(/\/preview\/vue\/preview\.html\?story=components-tag&/);
    await expect(opened.locator('.FixtureTag')).toHaveText('Active', { timeout: 60_000 });
    await expect(page.getByRole('main').getByRole('button', { name: 'open' })).toHaveCount(3);
  });
});
