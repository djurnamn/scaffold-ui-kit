// The charcell shell's layout of views, targets and context, driven through
// the host page on the development server: the top bar holds the kit as a
// label, the kit's own settings and the view and target toggles; the stage
// bar the navigation toggle and the component picker; the output heading's
// options popover the story's context and the global context; the scenario
// row the scenario picker and the editor; the status bar a group of the
// kit's own. The views are
// shell options the address keeps, and a scenario can set the context it
// shows the story in. Run with `pnpm test:e2e`.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { SCRIPTED_TARGETS, openHost, openOutputOptions, optionToggle, pick, pickScenario, selectStory, showView } from './support/host';

/** The bars, by the shell's own blocks. */
const topBar = (page: Page) => page.locator('.Application__layout > .Bar').first();
const stageBar = (page: Page) => page.getByRole('main').locator('.Bar').first();
const statusBar = (page: Page) => page.locator('.Bar--status');
const scenarioRow = (page: Page) => page.locator('[data-preview-scenario]');

/** A pane's document root. */
const paneRoot = (page: Page, target: string) => page.frameLocator(`iframe[title="${target}"]`).locator('html');

/** A view toggle's checkbox, for its state. */
const viewChecked = (page: Page, view: string): Locator =>
  page.getByRole('group', { name: 'views' }).getByRole('checkbox', { name: view, exact: true });

test.describe('Views, targets and context', () => {
  test('places the kit, its settings, the toggles and each kind of context', async ({ page }) => {
    await openHost(page, '/?component=components-tag&option.shell.scenario=true');
    // The kit is a label, not a control.
    await expect(topBar(page).getByTestId('kit-name')).toContainText('fixture-kit');
    await expect(topBar(page).getByRole('combobox', { name: 'kit' })).toHaveCount(0);
    // A kit-level setting, then the views and the targets, in the top bar.
    await expect(topBar(page).getByText('motion', { exact: true })).toBeVisible();
    await expect(topBar(page).getByRole('group', { name: 'views' })).toHaveText(/navigation\s*scenario\s*output\s*code\s*events/);
    await expect(topBar(page).getByRole('group', { name: 'targets' })).toHaveText(/react\s*vue\s*svelte\s*html/);
    // The stage bar: the component, with no navigation toggle and no context.
    await expect(stageBar(page).getByRole('checkbox', { name: 'navigation', exact: true })).toHaveCount(0);
    await expect(stageBar(page).getByTestId('select-component')).toHaveValue('Tag');
    await expect(stageBar(page).getByTestId('select-scenario')).toHaveCount(0);
    for (const label of ['padded', 'mode', 'surface'])
      await expect(stageBar(page).getByText(label, { exact: true })).toHaveCount(0);
    // The context, the story's and the global, named or not, in the output's options popover.
    await page.getByRole('main').getByRole('button', { name: 'options…' }).click();
    const options = page.getByRole('dialog', { name: 'output options' });
    await expect(options.getByText('padded', { exact: true })).toBeVisible();
    await expect(options.getByRole('combobox', { name: 'mode' })).toBeVisible();
    await expect(options.getByRole('combobox', { name: 'surface' })).toBeVisible();
    await page.keyboard.press('Escape');
    // The scenario row: its heading, the picker at the heading row's end, over the editor.
    await expect(scenarioRow(page).getByRole('heading', { name: 'scenario' })).toBeVisible();
    await expect(scenarioRow(page).getByTestId('select-scenario')).toBeVisible();
    await expect(scenarioRow(page).locator('[data-preview-editor]')).toBeVisible();
    // A group of the kit's own in the status bar.
    await expect(statusBar(page).getByText('outline', { exact: true })).toBeVisible();
    for (const label of ['mode', 'surface', 'padded', 'outline'])
      await expect(topBar(page).getByText(label, { exact: true })).toHaveCount(0);
  });

  test('heads each view showing, on the handle row above it where there is one', async ({ page }) => {
    await openHost(page, '/?component=components-tag&option.shell.scenario=true&option.shell.code=true');
    const heading = (name: string) => page.getByRole('main').getByRole('heading', { name, exact: true });
    await expect(heading('scenario')).toBeVisible();
    // output on the scenario row's handle row, code on the grid's, with the wrap toggle at its end.
    await expect(page.locator('.CharcellSplitter__handle-row').getByRole('heading', { name: 'output' })).toBeVisible();
    const codeRow = page.locator('.CharcellSplitGrid__handle-row');
    await expect(codeRow.getByRole('heading', { name: 'code' })).toBeVisible();
    await expect(codeRow.getByRole('checkbox', { name: 'wrap' })).toHaveCount(1);

    // Without the scenario row, the first view's heading has its row to itself; with output hidden, code is first.
    await showView(page, 'scenario', false);
    await showView(page, 'output', false);
    await expect(heading('scenario')).toHaveCount(0);
    await expect(heading('output')).toHaveCount(0);
    await expect(heading('code')).toBeVisible();
    await expect(page.getByRole('main').getByRole('checkbox', { name: 'wrap' })).toHaveCount(1);
  });

  test('keeps the views in the address, and starts with output alone', async ({ page }) => {
    await openHost(page, '/?component=components-tag');
    await expect(viewChecked(page, 'scenario')).not.toBeChecked();
    await expect(viewChecked(page, 'output')).toBeChecked();
    await expect(viewChecked(page, 'code')).not.toBeChecked();
    await expect(scenarioRow(page)).toHaveCount(0);

    await showView(page, 'scenario');
    await showView(page, 'output', false);
    await showView(page, 'code');
    await expect(page).toHaveURL(/[?&]option\.shell\.scenario=true(&|$)/);
    await expect(page).toHaveURL(/[?&]option\.shell\.output=false(&|$)/);
    await expect(page).toHaveURL(/[?&]option\.shell\.code=true(&|$)/);

    await page.reload();
    await expect(scenarioRow(page)).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-preview-code="react"]')).toBeVisible();
    await expect(page.locator('iframe[title="react"]')).toBeHidden();
    await expect(viewChecked(page, 'output')).not.toBeChecked();
  });

  test('a scenario sets the context it shows the story in, and leaves it set', async ({ page }) => {
    await openHost(page);
    await selectStory(page, 'Tag');
    await pickScenario(page, 'On dark');
    // The global context and the story's own follow the scenario: the
    // controls, the panes and the address.
    const options = await openOutputOptions(page);
    await expect(options.getByRole('combobox', { name: 'mode' })).toContainText('dark');
    await expect(options.getByRole('combobox', { name: 'surface' })).toContainText('2');
    await expect(optionToggle(page, 'padded').getByRole('checkbox')).not.toBeChecked();
    await page.keyboard.press('Escape');
    for (const target of [...SCRIPTED_TARGETS, 'html']) {
      await expect(paneRoot(page, target)).toHaveAttribute('data-fixture-mode', 'dark');
      await expect(paneRoot(page, target)).toHaveAttribute('data-fixture-surface', '2');
    }
    await expect(page.frameLocator('iframe[title="react"]').locator('body')).not.toHaveClass(/is-padded/);
    await expect(page).toHaveURL(/[?&]scenario=on-dark(&|$)/);
    await expect(page).toHaveURL(/[?&]option\.mode=dark(&|$)/);

    // Another scenario leaves the reader's context as it is.
    await pickScenario(page, 'Loud');
    await expect((await openOutputOptions(page)).getByRole('combobox', { name: 'mode' })).toContainText('dark');
    await page.keyboard.press('Escape');
    await expect(paneRoot(page, 'react')).toHaveAttribute('data-fixture-mode', 'dark');

    // A value changed back from the scenario's stays changed through a reload.
    await pickScenario(page, 'On dark');
    await pick((await openOutputOptions(page)).getByRole('combobox', { name: 'mode' }), 'light');
    await expect(page).toHaveURL(/[?&]option\.mode=light(&|$)/);
    await page.reload();
    await expect(paneRoot(page, 'react')).toHaveAttribute('data-fixture-mode', 'light', { timeout: 60_000 });
    await expect(paneRoot(page, 'react')).toHaveAttribute('data-fixture-surface', '2');
  });
});
