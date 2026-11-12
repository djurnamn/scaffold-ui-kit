// An unlisted story and a story that throws. The fixture kit's Probe and
// Faulty story files set `unlisted`: neither is in the navigation or the
// editor's add dialog, but each opens at its address in every pane and
// through the testing helpers. Faulty throws as it renders: each target
// pane shows the error in its place, and the status bar names the panes.
// Run with `pnpm test:e2e`.
import { expect, test } from '@playwright/test';
// A kit imports these from '@scaffold-ui-kit/preview/testing'; inside the package it is the source.
import { gotoPreview, setStory } from '../../src/testing';
import { SCRIPTED_TARGETS, openEditor, openHost, paneBody, pick } from './support/host';

const UNLISTED = ['Probe', 'Faulty'];

test.describe('An unlisted story', () => {
  test('is left out of the navigation', async ({ page }) => {
    await openHost(page);
    await expect(page.getByRole('treeitem', { name: 'Button', exact: true })).toBeVisible();
    for (const name of UNLISTED) {
      await expect(page.getByRole('treeitem', { name, exact: true })).toHaveCount(0);
    }
  });

  test("is left out of the editor's add dialog", async ({ page }) => {
    await openHost(page, '/?component=components-tag');
    const editor = await openEditor(page);
    await editor.getByRole('button', { name: 'add…', exact: true }).first().click();
    await pick(page.getByTestId('add-dialog-kind'), 'component');
    await page.getByTestId('add-dialog-component').click();
    await expect(page.getByRole('option', { name: 'Button', exact: true })).toBeVisible();
    for (const name of UNLISTED) {
      await expect(page.getByRole('option', { name, exact: true })).toHaveCount(0);
    }
  });

  test('opens at its address in every pane', async ({ page }) => {
    await page.goto('/?component=components-probe');
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureProbe')).toHaveText('probe', { timeout: 60_000 });
    }
    await expect(page.frameLocator('iframe[title="html"]').locator('#app')).toContainText('probe');
  });

  for (const target of SCRIPTED_TARGETS) {
    test(`opens through the testing helpers in ${target}`, async ({ page }) => {
      await gotoPreview(page, target);
      await setStory(page, 'components-probe', { label: 'reached' });
      await expect(page.locator('.FixtureProbe')).toHaveText('reached', { timeout: 30_000 });
    });
  }
});

test.describe('A story that throws', () => {
  test('shows its error in each target pane, and the status bar names them', async ({ page }) => {
    await page.goto('/?component=components-faulty');
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('pre')).toHaveText(
        "render error: Cannot read properties of undefined (reading 'toUpperCase')",
        { timeout: 60_000 },
      );
    }
    const status = page.locator('.Bar--status').getByRole('status');
    await expect(status).toHaveText(/^render error · /);
    for (const target of SCRIPTED_TARGETS) await expect(status).toContainText(target);
    // The messages open as a hint over it.
    await status.hover();
    await expect(page.getByRole('tooltip')).toContainText('toUpperCase');
    // Another story renders, and the status says so.
    await page.getByRole('treeitem', { name: 'Tag', exact: true }).click();
    await expect(status).toHaveText('ready', { timeout: 60_000 });
  });
});
