// The component's, the scenario's and a prop's descriptions in the charcell
// shell, their markdown rendered: each picker in the stage bar has an info
// button that opens its description in a popover, and there is no button
// where there is no description; a prop's description is the hint over its
// name. Inline code, emphasis and a code block render; a tag the text leaves
// bare shows as text. Run with `pnpm test:e2e`.
import { expect, test } from '@playwright/test';
import { openEditor, openHost, pickScenario, selectStory } from './support/host';

test.describe('Descriptions', () => {
  test("the stage bar opens the component's description and the picked scenario's", async ({ page }) => {
    await openHost(page);
    // The first story, Button, describes neither.
    await expect(page.getByRole('button', { name: /^about / })).toHaveCount(0);

    await selectStory(page, 'Tag');
    await page.getByRole('button', { name: 'about Tag' }).click();
    const popover = page.getByRole('dialog', { name: 'about Tag' });
    await expect(popover.locator('p')).toHaveText([
      'A status pill, set beside the thing whose state it names.',
      'Its text is the slot; set tone for how loud it is, or wrap it in a <label> of your own.',
    ]);
    await expect(popover.locator('strong')).toHaveText('slot');
    await expect(popover.locator('p code')).toHaveText('tone');
    await expect(popover.locator('label')).toHaveCount(0);
    await expect(popover.locator('pre')).toHaveText('<Tag tone="loud">Late</Tag>');
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);

    await pickScenario(page, 'Loud');
    await page.getByRole('button', { name: 'about Loud' }).click();
    const scenario = page.getByRole('dialog', { name: 'about Loud' });
    await expect(scenario).toHaveText('The loud tone, for a state that needs attention now.');
    await expect(scenario.locator('code')).toHaveText('loud');
    await page.keyboard.press('Escape');

    await pickScenario(page, '(default)');
    await expect(page.getByRole('button', { name: /^about / })).toHaveCount(1);
  });

  test("a prop's description is the hint over its name", async ({ page }) => {
    await openHost(page);
    await selectStory(page, 'Tag');
    const editor = await openEditor(page);
    // The props window starts collapsed.
    await editor.locator('button[data-editor-window="props"]').first().click();
    await editor.locator('.Control__label', { hasText: /^tone$/ }).hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toHaveText('How loud the pill is: calm or loud.');
    await expect(tooltip.locator('code')).toHaveText(['calm', 'loud']);
  });
});
