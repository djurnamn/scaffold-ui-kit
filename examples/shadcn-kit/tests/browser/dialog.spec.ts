import { expect, test } from '@playwright/test';
import { openStory } from '@scaffold-ui-kit/preview/testing';
import type { PreviewScriptedTarget } from '@scaffold-ui-kit/preview/testing';
import { readPreviewManifest } from '@scaffold-ui-kit/testing/browser';

// The sweep cannot walk a native modal dialog, so its keyboard behavior is
// tested here: the trigger opens it and Escape closes it, in every target.
test('Dialog opens from its trigger and closes on Escape', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  const dialog = readPreviewManifest('.').find(
    (component) => component.id === 'overlays-dialog'
  )!;
  const story = await openStory(page, {
    target,
    id: dialog.id,
    props: dialog.defaultProps,
  });

  await story.page.locator('[aria-haspopup="dialog"]').first().click();
  await expect(story.page.locator('dialog[open]')).toBeVisible();

  await story.page.keyboard.press('Escape');
  await expect(story.page.locator('dialog[open]')).toHaveCount(0);
});
