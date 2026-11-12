// The charcell shell's code panes, driven through the host page on the
// development server: the top bar's `code` view adds a code row to the
// stage's grid, each target's source under its pane, html's under the html
// pane; the sources follow a scenario pick and a prop edit, html included
// (printed by the server); a target turned off loses its column; and the
// option is one the address keeps across a reload. The grid's handles step a
// row or a column per arrow key, a press where a column's handle crosses the
// row's moves both, and the panes keep their frames while any view or target
// is hidden and shown; the scenario row's own handle steps a row. A column
// and the code row come back at the size they had when hidden; a hidden
// target's width goes to the others in proportion, and a double-click or
// Enter on a handle puts its split back where it started. A source
// longer or wider than its pane scrolls in its charcell ScrollArea, a whole
// row or column per arrow key. The wrap toggle on the code view's heading row
// wraps every code pane's lines, and a wrapped source scrolls only down. Run with `pnpm test:e2e`.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { clickToggle, openEditor, openHost, openOutputOptions, pick, pickScenario, selectStory, showView, viewToggle } from './support/host';

/** Every code pane, or the one of a target. */
const codePanes = (page: Page) => page.locator('[data-preview-code]');
const codePane = (page: Page, target: string) => page.locator(`[data-preview-code="${target}"]`);

/** The code view's toggle in the top bar: the element to click. */
const codeToggle = (page: Page) => viewToggle(page, 'code');

/** A code pane's source. */
const source = (page: Page, target: string) => codePane(page, target).locator('pre');

/** The scroll area a code pane's source scrolls in. */
const sourceArea = (page: Page, target: string) => page.getByRole('region', { name: `${target} code` });

/** How far a scroll area can scroll, down and across, in pixels. */
const scrollRange = (area: Locator) =>
  area.evaluate((element) => ({
    down: element.scrollHeight - element.clientHeight,
    across: element.scrollWidth - element.clientWidth,
  }));

/** An element's box, once laid out. */
const box = async (locator: Locator) => (await locator.boundingBox())!;

/** The face's row and column, in pixels, once the fonts have loaded. */
async function cell(page: Page): Promise<{ row: number; column: number }> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return page.getByRole('main').evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;width:1ch';
    element.append(probe);
    const column = probe.getBoundingClientRect().width;
    probe.remove();
    return { row: parseFloat(getComputedStyle(element).lineHeight), column };
  });
}

/** Marks every pane's iframe and the document in it, so a remount or a
 *  reload shows as a lost mark. */
async function markFrames(page: Page): Promise<() => Promise<boolean[]>> {
  const frames = page.locator('iframe[title]');
  await frames.evaluateAll((elements) =>
    elements.forEach((element) => {
      (element as unknown as { kept: boolean }).kept = true;
      ((element as HTMLIFrameElement).contentWindow as unknown as { kept: boolean }).kept = true;
    }),
  );
  return () =>
    frames.evaluateAll((elements) =>
      elements.map(
        (element) =>
          (element as unknown as { kept?: boolean }).kept === true &&
          ((element as HTMLIFrameElement).contentWindow as unknown as { kept?: boolean }).kept === true,
      ),
    );
}

test.describe('The code panes', () => {
  test('open from the top bar under each pane, and follow the story', async ({ page }) => {
    await openHost(page);
    await selectStory(page, 'Tag');
    await expect(codePanes(page)).toHaveCount(0);
    await clickToggle(codeToggle(page));
    await expect(page).toHaveURL(/[?&]option\.shell\.code=true(&|$)/);
    // A code pane per target, in the panes' order, each under its pane.
    await expect(codePanes(page)).toHaveCount(4);
    expect(await codePanes(page).evaluateAll((elements) => elements.map((element) => element.getAttribute('data-preview-code')))).toEqual([
      'react',
      'vue',
      'svelte',
      'html',
    ]);
    for (const target of ['react', 'vue', 'svelte', 'html']) {
      const pane = await box(page.locator(`iframe[title="${target}"]`));
      const code = await box(codePane(page, target));
      expect(code.y, `${target} code under its pane`).toBeGreaterThan(pane.y + pane.height);
      expect(code.x, `${target} code in its pane's column`).toBeLessThan(pane.x);
      expect(code.x + code.width, `${target} code in its pane's column`).toBeGreaterThan(pane.x + pane.width);
    }

    await expect(source(page, 'react')).toContainText("import { Tag } from 'fixture-kit/react';");
    await expect(source(page, 'react')).toContainText('return <Tag>Active</Tag>;');
    await expect(source(page, 'vue')).toContainText('<Tag>Active</Tag>');
    await expect(source(page, 'vue')).toContainText('<script setup lang="ts">');
    await expect(source(page, 'svelte')).toContainText("import { Tag } from 'fixture-kit/svelte';");
    await expect(source(page, 'html')).toHaveText('<span class="FixtureTag" data-tone="calm">Active</span>\n');

    // A scenario pick: html and every target follow.
    await pickScenario(page, 'Loud');
    await expect(source(page, 'html')).toHaveText('<span class="FixtureTag" data-tone="loud">Active</span>\n');
    await expect(source(page, 'react')).toContainText('return <Tag tone="loud">Active</Tag>;');

    // A prop edit, through the editor's root controls, followed live.
    await pickScenario(page, '(default)');
    const editor = await openEditor(page);
    await editor.locator('button[data-editor-window="props"]').first().click();
    await pick(editor.getByRole('combobox', { name: 'tone' }), 'loud');
    await expect(source(page, 'react')).toContainText('return <Tag tone="loud">Active</Tag>;');
    await editor.getByRole('textbox').first().fill('Edited');
    await expect(source(page, 'react')).toContainText('return <Tag tone="loud">Edited</Tag>;');
    await expect(source(page, 'html')).toHaveText('<span class="FixtureTag" data-tone="loud">Edited</span>\n', {
      timeout: 30_000,
    });
  });

  test('copies a pane\'s source', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openHost(page, '/?component=components-tag&option.shell.code=true');
    await codePane(page, 'vue').getByRole('button', { name: 'copy' }).click();
    await expect(codePane(page, 'vue').getByRole('status')).toHaveText('vue copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('<script setup lang="ts">');
    await expect(codePane(page, 'react').getByRole('status')).not.toHaveText('react copied');
  });

  test('drop the column of a target turned off, the other panes keeping their frames', async ({ page }) => {
    await openHost(page, '/?component=components-tag&option.shell.code=true');
    await expect(source(page, 'react')).toBeVisible();
    const kept = await markFrames(page);
    await clickToggle(page.getByRole('group', { name: 'targets' }).getByText('vue', { exact: true }));
    await expect(page.locator('iframe[title="vue"]')).toHaveCount(0);
    expect(await codePanes(page).evaluateAll((elements) => elements.map((element) => element.getAttribute('data-preview-code')))).toEqual([
      'react',
      'svelte',
      'html',
    ]);
    expect(await kept()).toEqual([true, true, true]);
  });

  test('share the stage with the panes in a row whose handle steps one row per arrow key', async ({ page }) => {
    await openHost(page, '/?component=components-tag&option.shell.code=true');
    await expect(source(page, 'react')).toBeVisible();
    const handle = page.getByRole('separator', { name: 'resize panes and code' });
    const { row } = await cell(page);
    const height = () => codePane(page, 'react').evaluate((element) => element.getBoundingClientRect().height);
    // On whole rows, to the layout's own unit (1/64px) that a grid's fractional tracks leave.
    const offRows = (value: number) => Math.min(value % row, row - (value % row));
    await expect.poll(async () => offRows(await height())).toBeLessThanOrEqual(1 / 64);
    await handle.focus();
    for (const [key, rows] of [
      ['ArrowUp', 1],
      ['ArrowUp', 1],
      ['ArrowDown', -1],
    ] as const) {
      const before = await height();
      await page.keyboard.press(key);
      await expect.poll(height).toBeCloseTo(before + rows * row, 1);
      // Every code pane takes the row's height.
      expect(await codePane(page, 'html').evaluate((element) => element.getBoundingClientRect().height)).toBeCloseTo(
        before + rows * row,
        1,
      );
    }
  });

  test('sit in columns whose handles step one column per arrow key, through both rows', async ({ page }) => {
    await openHost(page, '/?component=components-tag&option.shell.code=true');
    await expect(source(page, 'react')).toBeVisible();
    const handle = page.getByRole('separator', { name: 'resize react and vue' });
    const { column } = await cell(page);
    const width = (target: string) => async () => (await box(codePane(page, target))).width;
    const paneWidth = async () => (await box(page.locator('iframe[title="react"]'))).width;
    await handle.focus();
    for (const [key, columns] of [
      ['ArrowRight', 1],
      ['ArrowRight', 1],
      ['ArrowLeft', -1],
    ] as const) {
      const [before, beforeVue, beforePane] = [await width('react')(), await width('vue')(), await paneWidth()];
      await page.keyboard.press(key);
      await expect.poll(width('react')).toBeCloseTo(before + columns * column, 1);
      await expect.poll(width('vue')).toBeCloseTo(beforeVue - columns * column, 1);
      // The boundary moves through the preview row too.
      await expect.poll(paneWidth).toBeCloseTo(beforePane + columns * column, 1);
    }
  });

  test('move both boundaries from a press where a column handle crosses the row handle', async ({ page }) => {
    await openHost(page, '/?component=components-tag&option.shell.code=true');
    await expect(source(page, 'react')).toBeVisible();
    const { row, column } = await cell(page);
    const columnHandle = await box(page.getByRole('separator', { name: 'resize react and vue' }));
    const rowHandle = await box(page.getByRole('separator', { name: 'resize panes and code' }));
    const x = columnHandle.x + columnHandle.width / 2;
    const y = rowHandle.y + rowHandle.height / 2;
    const before = await box(codePane(page, 'react'));
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let step = 1; step <= 5; step++) await page.mouse.move(x + step * column, y - step * row);
    await page.mouse.up();
    const after = await box(codePane(page, 'react'));
    // The react column grew by whole columns, the code row by whole rows.
    const columns = (after.width - before.width) / column;
    const rows = (after.height - before.height) / row;
    expect(columns).toBeGreaterThan(0);
    expect(Math.abs(columns - Math.round(columns))).toBeLessThan(0.01);
    expect(rows).toBeGreaterThan(0);
    expect(Math.abs(rows - Math.round(rows))).toBeLessThan(0.01);
  });

  test('keep the panes and their frames while any view opens and closes', async ({ page }) => {
    await openHost(page, '/?component=components-tag');
    const kept = await markFrames(page);
    const all = [true, true, true, true];
    await clickToggle(codeToggle(page));
    await expect(source(page, 'react')).toBeVisible();
    expect(await kept()).toEqual(all);
    await clickToggle(codeToggle(page));
    await expect(codePanes(page)).toHaveCount(0);
    expect(await kept()).toEqual(all);
    await openEditor(page);
    expect(await kept()).toEqual(all);
    await showView(page, 'scenario', false);
    await expect(page.locator('[data-preview-editor]')).toHaveCount(0);
    expect(await kept()).toEqual(all);

    // The output row hidden: the panes stay in the page, out of sight, under
    // the code row and the scenario row alike.
    await showView(page, 'output', false);
    await expect(page.locator('iframe[title="react"]')).toBeHidden();
    expect(await kept()).toEqual(all);
    await showView(page, 'code');
    await expect(source(page, 'react')).toBeVisible();
    expect(await kept()).toEqual(all);
    await showView(page, 'scenario');
    await showView(page, 'code', false);
    await expect(page.locator('[data-preview-scenario]')).toBeVisible();
    expect(await kept()).toEqual(all);
    // No view at all: a note says how to show one.
    await showView(page, 'scenario', false);
    await expect(page.getByTestId('stage-note')).toBeVisible();
    expect(await kept()).toEqual(all);
    await showView(page, 'output');
    await expect(page.getByTestId('stage-note')).toHaveCount(0);
    await expect(page.locator('iframe[title="react"]')).toBeVisible();
    expect(await kept()).toEqual(all);
    // The panes still answer: an option reaches them.
    await openOutputOptions(page);
    await pick(page.getByRole('combobox', { name: 'mode' }), 'dark');
    await expect(page.frameLocator('iframe[title="react"]').locator('html')).toHaveAttribute('data-fixture-mode', 'dark');
  });

  test('share the stage with the scenario row, whose handle steps one row per arrow key', async ({ page }) => {
    await openHost(page, '/?component=components-tag');
    await openEditor(page);
    const handle = page.getByRole('separator', { name: 'resize scenario and panes' });
    const { row } = await cell(page);
    const editor = page.locator('[data-preview-scenario]');
    const height = () => editor.evaluate((element) => element.getBoundingClientRect().height);
    const gridHeight = () => page.locator('iframe[title="react"]').evaluate((element) => element.getBoundingClientRect().height);
    await expect.poll(async () => (await height()) % row).toBe(0);
    await handle.focus();
    for (const [key, rows] of [
      ['ArrowDown', 1],
      ['ArrowDown', 1],
      ['ArrowUp', -1],
    ] as const) {
      const [before, beforeGrid] = [await height(), await gridHeight()];
      await page.keyboard.press(key);
      await expect.poll(height).toBe(before + rows * row);
      // The grid gives up the row.
      await expect.poll(gridHeight).toBe(beforeGrid - rows * row);
    }
  });

  test('stay open through a reload, and close from the top bar', async ({ page }) => {
    await openHost(page);
    await selectStory(page, 'IconLabel');
    await clickToggle(codeToggle(page));
    await expect(codePanes(page).first()).toBeVisible();
    await page.reload();
    await expect(codePanes(page).first()).toBeVisible({ timeout: 60_000 });
    await expect(source(page, 'react')).toContainText('<IconLabel icon={<Dot />} />');
    await clickToggle(codeToggle(page));
    await expect(codePanes(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/option\.shell\.code/);
  });

  test('scroll a long source a whole row per arrow key, and a wide one a column', async ({ page }) => {
    // Unwrapped, so a long line runs on and the source scrolls across too.
    await openHost(page, '/?component=components-tag&option.shell.code=true&option.shell.wrap=false');
    await expect(source(page, 'vue')).toBeVisible();
    const { row, column } = await cell(page);
    // The code row down to a few rows, shorter than vue's seven lines.
    await page.getByRole('separator', { name: 'resize panes and code' }).focus();
    for (let step = 0; step < 30; step++) await page.keyboard.press('ArrowDown');
    const area = sourceArea(page, 'vue');
    await expect.poll(async () => (await scrollRange(area)).down).toBeGreaterThan(row);
    const { down, across } = await scrollRange(area);
    // The ranges are whole rows and columns.
    expect(down % row).toBe(0);
    expect(across).toBeGreaterThan(0);
    const offset = () => area.evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft }));
    await area.focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(offset).toEqual({ top: row, left: 0 });
    await page.keyboard.press('End');
    await expect.poll(offset).toEqual({ top: down, left: 0 });
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await offset()).left).toBeCloseTo(column, 1);
  });

  test('wrap every pane\'s long lines by default, the code heading\'s toggle and the address turning it off', async ({ page }) => {
    await openHost(page, '/?component=components-tag&option.shell.code=true');
    await expect(source(page, 'react')).toBeVisible();
    const whiteSpace = (target: string) => source(page, target).evaluate((element) => getComputedStyle(element).whiteSpace);
    // Wrapped by default: html's one long line wraps at the pane's edge and scrolls across no more.
    for (const target of ['react', 'vue', 'svelte', 'html']) await expect.poll(() => whiteSpace(target)).toBe('pre-wrap');
    await expect.poll(async () => (await scrollRange(sourceArea(page, 'html'))).across).toBe(0);
    // One toggle, on the code view's heading row, for every pane.
    const wrap = page.getByRole('main').getByRole('checkbox', { name: 'wrap' });
    await expect(wrap).toHaveCount(1);
    await expect(wrap).toBeChecked();
    await expect(codePane(page, 'react').getByRole('checkbox', { name: 'wrap' })).toHaveCount(0);
    await page.getByRole('main').getByText('wrap', { exact: true }).click();
    await expect(page).toHaveURL(/[?&]option\.shell\.wrap=false(&|$)/);
    // Unwrapped, every pane's lines run on, and html's scrolls across.
    for (const target of ['react', 'vue', 'svelte', 'html']) await expect.poll(() => whiteSpace(target)).toBe('pre');
    await expect.poll(async () => (await scrollRange(sourceArea(page, 'html'))).across).toBeGreaterThan(0);
    await page.reload();
    await expect.poll(() => whiteSpace('svelte'), { timeout: 60_000 }).toBe('pre');
    await page.getByRole('main').getByText('wrap', { exact: true }).click();
    await expect.poll(() => whiteSpace('react')).toBe('pre-wrap');
    await expect(page).not.toHaveURL(/option\.shell\.wrap/);
  });

  test('bring a column back at its width when its target is shown again', async ({ page }) => {
    await openHost(page, '/?component=components-tag');
    const { column } = await cell(page);
    const width = async () => (await box(page.locator('iframe[title="vue"]'))).width;
    await page.getByRole('separator', { name: 'resize react and vue' }).focus();
    for (let step = 0; step < 4; step++) await page.keyboard.press('ArrowLeft');
    const resized = await width();
    const targets = page.getByRole('group', { name: 'targets' });
    await clickToggle(targets.getByText('vue', { exact: true }));
    await expect(page.locator('iframe[title="vue"]')).toHaveCount(0);
    await clickToggle(targets.getByText('vue', { exact: true }));
    await expect(page.locator('iframe[title="vue"]')).toHaveCount(1);
    await expect.poll(width).toBeCloseTo(resized, 0);
    expect(Math.abs((await width()) - resized)).toBeLessThan(column);
  });

  test('share a hidden target’s width among the others in proportion, and give it back when it is shown', async ({ page }) => {
    await openHost(page, '/?component=components-tag');
    const { column } = await cell(page);
    // A column's width: its cell's, the pane and its ring included.
    const width = (target: string) => () =>
      page
        .locator(`iframe[title="${target}"]`)
        .evaluate((element) => element.closest<HTMLElement>('.CharcellSplitGrid__cell')!.getBoundingClientRect().width);
    const widths = async (targets: string[]) => Promise.all(targets.map((target) => width(target)()));
    // Unequal columns to start: react narrower, vue wider.
    await page.getByRole('separator', { name: 'resize react and vue' }).focus();
    for (let step = 0; step < 6; step++) await page.keyboard.press('ArrowLeft');
    const [react, vue, svelte, html] = await widths(['react', 'vue', 'svelte', 'html']);
    const targets = page.getByRole('group', { name: 'targets' });
    await clickToggle(targets.getByText('svelte', { exact: true }));
    await expect(page.locator('iframe[title="svelte"]')).toHaveCount(0);
    // svelte's width and its handle's go to the others, each by its own width.
    const grown = (react + vue + html + svelte + column) / (react + vue + html);
    const after = await widths(['react', 'vue', 'html']);
    [react, vue, html].forEach((before, index) => expect(Math.abs(after[index] - before * grown)).toBeLessThanOrEqual(column * 1.5));
    // Shown again, svelte comes back at its width, the others giving way in proportion.
    await clickToggle(targets.getByText('svelte', { exact: true }));
    await expect(page.locator('iframe[title="svelte"]')).toHaveCount(1);
    // The grid snaps to cells: within a column of where it was.
    await expect.poll(async () => Math.abs((await width('svelte')()) - svelte)).toBeLessThanOrEqual(column);
    const back = await widths(['react', 'vue', 'html']);
    [react, vue, html].forEach((before, index) => expect(Math.abs(back[index] - before)).toBeLessThanOrEqual(column * 1.5));
  });

  test('put a split back at equal columns on a double-click on a handle, or Enter on it', async ({ page }) => {
    await openHost(page, '/?component=components-tag&option.shell.code=true');
    await expect(source(page, 'react')).toBeVisible();
    const { row, column } = await cell(page);
    const targets = ['react', 'vue', 'svelte', 'html'];
    const widths = () => Promise.all(targets.map(async (target) => (await box(codePane(page, target))).width));
    const even = async () => {
      const all = await widths();
      return Math.max(...all) - Math.min(...all);
    };
    const handle = page.getByRole('separator', { name: 'resize react and vue' });
    await handle.focus();
    for (let step = 0; step < 4; step++) await page.keyboard.press('ArrowRight');
    expect(await even()).toBeGreaterThan(column * 3);
    await handle.dblclick();
    await expect.poll(even).toBeLessThanOrEqual(column * 1.5);
    await handle.focus();
    for (let step = 0; step < 4; step++) await page.keyboard.press('ArrowLeft');
    expect(await even()).toBeGreaterThan(column * 3);
    await page.keyboard.press('Enter');
    await expect.poll(even).toBeLessThanOrEqual(column * 1.5);
    // The rows' handle puts the code row back at its starting height. Down,
    // the code row giving way: the output row starts at its story's few rows,
    // and up it would stop at its least.
    const height = () => codePane(page, 'react').evaluate((element) => element.getBoundingClientRect().height);
    const start = await height();
    const rowHandle = page.getByRole('separator', { name: 'resize panes and code' });
    await rowHandle.focus();
    for (let step = 0; step < 3; step++) await page.keyboard.press('ArrowDown');
    await expect.poll(height).toBeCloseTo(start - 3 * row, 0);
    await rowHandle.dblclick();
    await expect.poll(height).toBeCloseTo(start, 0);
  });

  test('bring the code row back at its height when the code view is shown again', async ({ page }) => {
    await openHost(page, '/?component=components-tag&option.shell.code=true');
    await expect(source(page, 'react')).toBeVisible();
    const { row } = await cell(page);
    const height = () => codePane(page, 'react').evaluate((element) => element.getBoundingClientRect().height);
    await page.getByRole('separator', { name: 'resize panes and code' }).focus();
    for (let step = 0; step < 3; step++) await page.keyboard.press('ArrowUp');
    const resized = await height();
    await clickToggle(codeToggle(page));
    await expect(codePanes(page)).toHaveCount(0);
    await clickToggle(codeToggle(page));
    await expect(source(page, 'react')).toBeVisible();
    await expect.poll(height).toBe(resized);
    // On whole rows, to the layout's own unit (1/64px) that a grid's fractional tracks leave.
    expect(Math.min(resized % row, row - (resized % row))).toBeLessThanOrEqual(1 / 64);
  });
});
