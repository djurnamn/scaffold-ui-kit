// Links into the preview and the panes' size, in the charcell shell: a
// `?component=` and `scenario=` address opens that story, option values,
// the story's props and the visible targets round-trip through the
// address, an untouched page keeps its address, and each pane fills its
// frame. Run with `pnpm test:e2e`.
import { expect, test } from '@playwright/test';
import { SCRIPTED_TARGETS, clickToggle, openEditor, openHost, openOutputOptions, optionToggle, paneBody, pick, pickScenario, selectStory, showView } from './support/host';

test.describe('Links into the preview', () => {
  test('?component= and scenario= open that story', async ({ page }) => {
    await openHost(page, '/?component=components-iconlabel&scenario=icon-only');
    await expect(page.getByTestId('select-component')).toHaveValue('IconLabel');
    await showView(page, 'scenario');
    await expect(page.getByTestId('select-scenario')).toContainText('Icon only');
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureIconLabel__label')).toHaveText('');
    }
  });

  test('option values round-trip through the address', async ({ page }) => {
    await openHost(page);
    // A context option and a story option (the output's options) and a canvas option (status bar).
    await openOutputOptions(page);
    await pick(page.getByRole('combobox', { name: 'mode' }), 'dark');
    await expect(page).toHaveURL(/[?&]option\.mode=dark(&|$)/);
    for (const target of SCRIPTED_TARGETS) {
      await expect(page.frameLocator(`iframe[title="${target}"]`).locator('html')).toHaveAttribute(
        'data-fixture-mode',
        'dark',
      );
    }
    await openOutputOptions(page);
    await clickToggle(optionToggle(page, 'padded'));
    await expect(page).toHaveURL(/[?&]option\.padded=false(&|$)/);
    await clickToggle(optionToggle(page, 'outline'));
    await expect(page).toHaveURL(/[?&]option\.outline=true(&|$)/);
    await expect(paneBody(page, 'react')).toHaveClass(/is-outlined/);
    await expect(paneBody(page, 'react')).not.toHaveClass(/is-padded/);

    // Opening the address shows the same values.
    await openHost(
      page,
      '/?component=components-button&option.mode=dark&option.padded=false&option.outline=true&option.shell.scenario=true',
    );
    await openOutputOptions(page);
    await expect(page.getByRole('combobox', { name: 'mode' })).toContainText('dark');
    await expect(optionToggle(page, 'padded').getByRole('checkbox')).not.toBeChecked();
    await expect(optionToggle(page, 'outline').getByRole('checkbox')).toBeChecked();
    await expect(page.frameLocator('iframe[title="vue"]').locator('html')).toHaveAttribute('data-fixture-mode', 'dark');
  });

  test('an untouched page keeps the address it was opened with', async ({ page }) => {
    await openHost(page, '/?tab=docs');
    await expect(page).toHaveURL(/\/\?tab=docs$/);
    await selectStory(page, 'Tag');
    await expect(page).toHaveURL(/\?tab=docs&component=components-tag$/);
  });

  test("the story's props round-trip through the address", async ({ page }) => {
    await openHost(page);
    await selectStory(page, 'Tag');
    const editor = await openEditor(page);
    await editor.locator('button[data-editor-window="props"]').first().click();
    await pick(editor.getByRole('combobox', { name: 'tone' }), 'loud');
    await expect(page).toHaveURL(/[?&]props=%7B%22tone%22:%22loud%22%7D(&|$)/);

    await openHost(page, '/?component=components-tag&props=%7B%22tone%22:%22loud%22%7D');
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureTag')).toHaveAttribute('data-tone', 'loud');
    }
    // A scenario seeds the props afresh, and they leave the address.
    await pickScenario(page, 'Loud');
    await expect(page).not.toHaveURL(/[?&]props=/);
  });

  test('the visible targets round-trip through the address', async ({ page }) => {
    await openHost(page);
    await clickToggle(page.getByRole('group', { name: 'targets' }).getByText('vue', { exact: true }));
    await expect(page.locator('iframe[title="vue"]')).toHaveCount(0);
    await expect(page).toHaveURL(/[?&]targets=react,svelte,html(&|$)/);

    await page.goto('/?component=components-button&targets=react,svelte,html');
    await expect(paneBody(page, 'react')).not.toHaveText('', { timeout: 60_000 });
    await expect(page.locator('iframe[title="vue"]')).toHaveCount(0);
    await expect(page.locator('iframe[title="svelte"]')).toHaveCount(1);
  });

  test('each pane fills its frame', async ({ page }) => {
    await openHost(page);
    const viewport = page.viewportSize()!;
    for (const target of SCRIPTED_TARGETS) {
      const box = await page.locator(`iframe[title="${target}"]`).boundingBox();
      expect(box, `${target} pane`).not.toBeNull();
      expect(box!.height, `${target} pane height`).toBeGreaterThan(viewport.height / 2);
    }
  });
});
