// The development server regenerates as the kit changes, on the served kit
// (the copy under tests/browser/.kit, never the committed fixture): a
// scenario added to a story file is offered in the shell, and an edited theme
// stylesheet restyles the panes, both without reloading by hand, and each
// goes again once the file is restored. Run with `pnpm test:e2e`.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { SCRIPTED_TARGETS, openHost, pickScenario } from './support/host';

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), '.kit');
const storyPath = resolve(kitRoot, 'preview/stories/Tag.story.ts');
const themePath = resolve(kitRoot, 'themes/light.css');

/** Every pane's root text color. */
async function expectPaneColor(page: Page, color: string): Promise<void> {
  for (const target of SCRIPTED_TARGETS) {
    await expect
      .poll(
        () =>
          page
            .frameLocator(`iframe[title="${target}"]`)
            .locator('html')
            .evaluate((element) => getComputedStyle(element).color)
            .catch(() => ''),
        { timeout: 30_000 },
      )
      .toBe(color);
  }
}

/** Whether the scenario picker offers `label`, opening and closing it to look. */
async function expectOffered(page: Page, label: string, offered: boolean): Promise<void> {
  await expect(async () => {
    await page.keyboard.press('Escape');
    await page.getByTestId('select-scenario').click();
    const option = page.getByRole('option', { name: label, exact: true });
    if (offered) await expect(option).toBeVisible({ timeout: 2_000 });
    else await expect(option).toHaveCount(0, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.keyboard.press('Escape');
}

test.describe('Regeneration on a kit change', () => {
  test('a scenario added to a story file is offered without a reload by hand', async ({ page }) => {
    const original = readFileSync(storyPath, 'utf8');
    // The scenario row shows, so its picker does.
    await openHost(page, '/?component=components-tag&option.shell.scenario=true');
    await expectOffered(page, 'Loud', true);
    await expectOffered(page, 'Hushed', false);

    try {
      writeFileSync(
        storyPath,
        original.replace("scenarios: [", "scenarios: [{ id: 'hushed', label: 'Hushed', props: { tone: 'calm' } }, "),
      );
      await expectOffered(page, 'Hushed', true);
      // The reload kept the story the address names, and the new scenario applies.
      await pickScenario(page, 'Hushed');
      await expect(page).toHaveURL(/[?&]scenario=hushed(&|$)/);
    } finally {
      writeFileSync(storyPath, original);
    }
    await expectOffered(page, 'Hushed', false);
  });

  test('an edited theme stylesheet restyles the panes without a reload by hand', async ({ page }) => {
    const original = readFileSync(themePath, 'utf8');
    await openHost(page);
    await expectPaneColor(page, 'rgb(0, 0, 0)');
    try {
      writeFileSync(themePath, original.replace('color: black;', 'color: rgb(1, 2, 3);'));
      await expectPaneColor(page, 'rgb(1, 2, 3)');
    } finally {
      writeFileSync(themePath, original);
    }
    await expectPaneColor(page, 'rgb(0, 0, 0)');
  });
});
