// The package's own testing helper against a running preview: `openStory`
// loads one target's pane on its own, mounts a story with props, and
// applies option values, the way a kit's browser tests use it. Run with
// `pnpm test:e2e`.
import { expect, test } from '@playwright/test';
// A kit imports this from '@scaffold-ui-kit/preview/testing'; inside the package it is the source.
import { openStory } from '../../src/testing';
import { SCRIPTED_TARGETS } from './support/host';

for (const target of SCRIPTED_TARGETS) {
  test(`openStory mounts a story with props and options in ${target}`, async ({ page }) => {
    const story = await openStory(page, {
      target: target,
      id: 'components-glyph',
      props: { name: 'cross' },
      options: { mode: 'dark' },
    });
    await expect(story.page.locator('.FixtureGlyph')).toHaveText('cross', { timeout: 30_000 });
    await expect(story.page.locator('html')).toHaveAttribute('data-fixture-mode', 'dark');
    await story.setProps({ name: 'check' });
    await expect(story.page.locator('.FixtureGlyph')).toHaveText('check');
    await story.setOptions({ mode: 'light' });
    await expect(story.page.locator('html')).toHaveAttribute('data-fixture-mode', 'light');
    await story.mountStory('components-iconlabel', { label: 'Mounted' });
    await expect(story.page.locator('.FixtureIconLabel__label')).toHaveText('Mounted');
  });
}
