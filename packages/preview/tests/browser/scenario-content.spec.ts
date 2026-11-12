// A scenario with slot content of its own, in the charcell shell: picking it
// shows its content in every pane, in each target's code and in the html,
// another scenario shows the story's content again, a link opens it, the
// editor starts from it, and a detached pane mounts it. Run with
// `pnpm test:e2e`.
import { expect, test } from '@playwright/test';
import { SCRIPTED_TARGETS, openEditor, openHost, paneBody, pickScenario, showView } from './support/host';

const TAG = '/?component=components-tag';

test.describe('A scenario with content of its own', () => {
  test('shows its content in every pane, and the story\'s again on another scenario', async ({ page }) => {
    await openHost(page, TAG);
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureTag')).toHaveText('Active');
    }
    await showView(page, 'scenario');
    await pickScenario(page, 'Paused');
    await expect(page).toHaveURL(/[?&]scenario=paused(&|$)/);
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureTag')).toHaveText('Paused');
    }
    await pickScenario(page, 'Loud');
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureTag')).toHaveText('Active');
      await expect(paneBody(page, target).locator('.FixtureTag')).toHaveAttribute('data-tone', 'loud');
    }
  });

  test('prints its content in each target\'s code and in the html', async ({ page }) => {
    await openHost(page, `${TAG}&scenario=paused&option.shell.code=true`);
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureTag')).toHaveText('Paused');
      await expect(page.locator(`[data-preview-code="${target}"] pre`)).toContainText('Paused');
      await expect(page.locator(`[data-preview-code="${target}"] pre`)).not.toContainText('Active');
    }
    await expect(page.locator('[data-preview-code="html"] pre')).toHaveText(
      '<span class="FixtureTag" data-tone="calm">Paused</span>\n',
      { timeout: 30_000 },
    );
  });

  test('keeps its content through a prop edit and a reload of the pane', async ({ page }) => {
    await openHost(page, `${TAG}&scenario=paused&props=%7B%22tone%22%3A%22loud%22%7D`);
    for (const target of SCRIPTED_TARGETS) {
      const tag = paneBody(page, target).locator('.FixtureTag');
      await expect(tag).toHaveText('Paused');
      await expect(tag).toHaveAttribute('data-tone', 'loud');
    }
    await page.reload();
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureTag')).toHaveText('Paused', { timeout: 60_000 });
    }
  });

  test('seeds the editor from its content', async ({ page }) => {
    await openHost(page, `${TAG}&scenario=paused`);
    const editor = await openEditor(page);
    // The tree's text node holds the scenario's text, in a field.
    const values = () =>
      editor.locator('input, textarea').evaluateAll((fields) =>
        fields.map((field) => (field as HTMLInputElement).value),
      );
    await expect.poll(values).toContain('Paused');
    expect(await values()).not.toContain('Active');
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureTag')).toHaveText('Paused');
    }
  });
});
