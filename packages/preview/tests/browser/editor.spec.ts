// The scenario editor in the charcell shell, driven through the host page on
// the development server (its regeneration endpoint exists there alone): the
// scenario picker, opening the editor, editing text and props, adding
// children through the add dialog, the Empty scenario, a story file's named
// default, and reordering through the editor's test hook. Every edit
// regenerates the story in all three panes. Run with `pnpm test:e2e`.
import { expect, test } from '@playwright/test';
import { SCRIPTED_TARGETS, openEditor, openHost, paneBody, pick, pickScenario, positionIn, selectStory, showView } from './support/host';

// The component the editor hosts (a default slot seeded with text), the text
// its story renders, and the component added as a child.
const HOST = 'Tag';
const RENDERED = 'Active';
const CHILD = 'Button';

test.describe('Scenario editor', () => {
  test('edits regenerate the scratch story across all three targets', async ({ page }) => {
    await openHost(page);
    await selectStory(page, HOST);
    const editor = await openEditor(page);

    // The prebuilt story shows until the first edit; the first regeneration
    // compiles the emitters on the server, so it gets a longer wait.
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target)).toContainText(RENDERED, { timeout: 30_000 });
    }

    // Edit the seeded text node (the only textbox while the root's props are collapsed).
    await editor.getByRole('textbox').first().fill('Saved!');
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target)).toContainText('Saved!', { timeout: 30_000 });
    }

    // Add a child component through the root's add dialog, imported with its
    // defaults so its label renders.
    await editor.getByRole('button', { name: 'add…', exact: true }).first().click();
    const dialog = page.locator('[data-preview-dialog]');
    await pick(page.getByTestId('add-dialog-kind'), 'component');
    await pick(page.getByTestId('add-dialog-component'), CHILD);
    await page.getByTestId('add-dialog-scenario').click();
    await page.getByRole('option').nth(1).click(); // empty, then default
    await dialog.getByRole('button', { name: 'add', exact: true }).click();
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target)).toContainText(CHILD, { timeout: 30_000 });
    }

    // The editor survived every regeneration.
    await expect(editor).toBeVisible();
  });

  test('a component story embeds the editor, the root unwrapped, edits regenerate', async ({ page }) => {
    await openHost(page);
    await selectStory(page, HOST);
    const editor = await openEditor(page);
    // The root is the stage bar's component: named on its first row, with no
    // picker of its own, its props and slots directly in the scenario row,
    // the props window collapsed.
    await expect(editor.locator('.EditorPanel__row').first()).toHaveText(/^component\s*Tag$/);
    await expect(editor.locator('.CharcellSelectTrigger')).toHaveCount(0);
    await expect(editor.locator('button[data-editor-window="props"]').first()).toHaveText('expand');
    await expect(editor.locator('button[data-editor-window="slot: default"]').first()).toHaveText('collapse');
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target)).toContainText(RENDERED, { timeout: 30_000 });
    }

    await editor.getByRole('textbox').first().fill('Embedded!');
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target)).toContainText('Embedded!', { timeout: 30_000 });
    }
    await expect(editor).toBeVisible();
  });

  test('editing a root prop updates the panes without a regeneration', async ({ page }) => {
    await openHost(page);
    await selectStory(page, HOST);
    const editor = await openEditor(page);
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target)).toContainText(RENDERED, { timeout: 30_000 });
    }
    await editor.locator('button[data-editor-window="props"]').first().click();
    await expect(editor.locator('button[data-editor-window="props"]').first()).toHaveText('collapse');
    // The tone prop is a choice: its control is a select labeled by the prop.
    await pick(editor.getByRole('combobox', { name: 'tone' }), 'loud');
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureTag')).toHaveAttribute('data-tone', 'loud');
    }
  });

  test('the Empty scenario renders empty, and the editor shows its empty tree', async ({ page }) => {
    await openHost(page);
    await selectStory(page, HOST);
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target)).toContainText(RENDERED, { timeout: 30_000 });
    }

    await pickScenario(page, 'Empty');
    const editor = page.locator('[data-preview-editor]');
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target)).not.toContainText(RENDERED, { timeout: 30_000 });
      await expect(paneBody(page, target).locator('.FixtureTag')).toHaveCount(1);
    }
    await showView(page, 'scenario');
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('textbox')).toHaveCount(0);

    // Hiding the scenario row hides the editor, and the panes stay empty.
    await showView(page, 'scenario', false);
    await expect(editor).toHaveCount(0);
    await expect(paneBody(page, 'react').locator('.FixtureTag')).toHaveCount(1);
    await expect(paneBody(page, 'react')).not.toContainText(RENDERED);
  });

  test('a content-less component offers no Empty scenario', async ({ page }) => {
    await openHost(page, '/?option.shell.scenario=true');
    const picker = page.getByTestId('select-scenario');
    const lead = page.getByTestId('select-component');

    // A component with a slot has the Empty scenario.
    await selectStory(page, HOST);
    await expect(lead).toHaveValue(HOST);
    await picker.click();
    await expect(page.getByRole('option', { name: 'Empty', exact: true })).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('option')).toHaveCount(0);

    // A component without one offers only its generated scenarios, and the editor still opens.
    await selectStory(page, 'Glyph');
    await expect(lead).toHaveValue('Glyph');
    await picker.click();
    await expect(page.getByRole('option', { name: '(default)', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'name: cross', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Empty', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-preview-editor]')).toBeVisible();
  });

  test('a story file can name the default scenario', async ({ page }) => {
    await openHost(page, '/?option.shell.scenario=true');
    await selectStory(page, 'IconLabel');
    const picker = page.getByTestId('select-scenario');
    await expect(picker).toBeVisible();
    await expect(picker).toContainText('Icon and label (default)');
    await picker.click();
    await expect(page.getByRole('option')).toHaveText(['Icon and label (default)', 'Empty', 'Icon only']);
    await page.keyboard.press('Escape');

    // The named slot's fill renders, and the other scenario clears the label.
    await expect(paneBody(page, 'react').locator('.FixtureDot')).toHaveCount(1);
    await pick(picker, 'Icon only');
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureIconLabel__label')).toHaveText('');
    }
  });

  test('the add dialog imports a component empty by default', async ({ page }) => {
    await openHost(page);
    await selectStory(page, HOST);
    const editor = await openEditor(page);
    await editor.getByRole('textbox').first().fill('ROOTTEXT');
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target)).toContainText('ROOTTEXT', { timeout: 30_000 });
    }

    await editor.getByRole('button', { name: 'add…', exact: true }).first().click();
    const dialog = page.locator('[data-preview-dialog]');
    await pick(page.getByTestId('add-dialog-kind'), 'component');
    await pick(page.getByTestId('add-dialog-component'), CHILD);
    await expect(page.getByTestId('add-dialog-scenario')).toContainText('empty');
    await dialog.getByRole('button', { name: 'add', exact: true }).click();

    // The child mounts in every pane, with nothing in its slot.
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target)).toContainText('ROOTTEXT', { timeout: 30_000 });
      await expect(paneBody(page, target).locator('.FixtureButton')).toHaveCount(1, { timeout: 30_000 });
      await expect(paneBody(page, target).locator('.FixtureButton')).toHaveText('');
    }
  });

  test('a nested component takes its own text child', async ({ page }) => {
    await openHost(page);
    await selectStory(page, HOST);
    const editor = await openEditor(page);
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target)).toContainText(RENDERED, { timeout: 30_000 });
    }

    // Add a Button, then a text node through the Button node's own add button.
    await editor.getByRole('button', { name: 'add…', exact: true }).first().click();
    const dialog = page.locator('[data-preview-dialog]');
    await pick(page.getByTestId('add-dialog-kind'), 'component');
    await pick(page.getByTestId('add-dialog-component'), CHILD);
    await dialog.getByRole('button', { name: 'add', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const buttonNode = editor.getByRole('listitem').filter({ has: page.getByRole('combobox', { name: CHILD }) });
    await buttonNode.getByRole('button', { name: 'add…', exact: true }).click();
    await dialog.getByRole('textbox').fill('NESTED');
    await dialog.getByRole('button', { name: 'add', exact: true }).click();
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureButton')).toHaveText('NESTED', { timeout: 30_000 });
    }
  });

  // A drag is simulated unreliably, so the move is driven through the
  // editor's test hook, which resolves it as a drop does.
  test('reorder moves a node and regenerates the new order everywhere', async ({ page }) => {
    await openHost(page);
    await selectStory(page, HOST);
    const editor = await openEditor(page);
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target)).toContainText(RENDERED, { timeout: 30_000 });
    }

    await editor.getByRole('textbox').first().fill('AAA');
    await editor.getByRole('button', { name: 'add…', exact: true }).first().click();
    const dialog = page.locator('[data-preview-dialog]');
    await dialog.getByRole('textbox').fill('ZZZ'); // the kind defaults to text
    await dialog.getByRole('button', { name: 'add', exact: true }).click();
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target)).toContainText('ZZZ', { timeout: 30_000 });
      expect(await positionIn(page, target, 'AAA')).toBeGreaterThanOrEqual(0);
      expect(await positionIn(page, target, 'ZZZ')).toBeGreaterThan(await positionIn(page, target, 'AAA'));
    }

    // Move ZZZ (default slot, index 1) before AAA.
    await page.evaluate(() => {
      const move = (
        window as unknown as {
          __previewEditorMove?: (
            from: { slot: string; index: number }[],
            target: { parent: { slot: string; index: number }[]; slot: string; index: number },
          ) => void;
        }
      ).__previewEditorMove;
      if (!move) throw new Error('The editor exposes no __previewEditorMove hook');
      move([{ slot: 'default', index: 1 }], { parent: [], slot: 'default', index: 0 });
    });
    for (const target of SCRIPTED_TARGETS) {
      await expect
        .poll(
          async () => {
            const a = await positionIn(page, target, 'AAA');
            const z = await positionIn(page, target, 'ZZZ');
            return z >= 0 && a >= 0 && z < a;
          },
          { timeout: 30_000 },
        )
        .toBe(true);
    }
    await expect(editor).toBeVisible();
  });
});
