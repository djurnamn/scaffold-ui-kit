import { test, expect } from '@playwright/test';
import {
  openStory,
  type PreviewScriptedTarget,
} from '@scaffold-ui-kit/preview/testing';

const target = (info: { project: { name: string } }) =>
  info.project.name as PreviewScriptedTarget;

test('modal traps focus, names itself and returns focus', async ({
  page,
}, info) => {
  await openStory(page, {
    target: target(info),
    id: 'overlays-modal',
    props: { title: 'Delete it?', description: 'Cannot be undone.' },
  });
  const trigger = page.locator('[data-part="trigger"]');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName('Delete it?');
  await expect(dialog).toHaveAccessibleDescription('Cannot be undone.');
  await expect(dialog).toHaveAttribute('data-state', 'open');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('data-state', 'closed');
});

test('modal without a title is named by label', async ({ page }, info) => {
  await openStory(page, {
    target: target(info),
    id: 'overlays-modal',
    props: { label: 'Quick actions', defaultOpen: true },
  });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('Quick actions');
  await expect(dialog).not.toHaveAttribute('aria-labelledby');
  await expect(dialog).not.toHaveAttribute('aria-describedby');
});

test('controlled modal stays with its prop', async ({ page }, info) => {
  test.skip(
    info.project.name === 'svelte',
    'Svelte cannot tell a bound prop from a plain one, so an unbound `open` follows the change.'
  );
  const story = await openStory(page, {
    target: target(info),
    id: 'overlays-modal',
    props: { open: true, title: 'T' },
  });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveAttribute('data-state', 'open');
  await story.setProps({ open: false, title: 'T' });
  await expect(page.getByRole('dialog')).toBeHidden();
});

const options = [
  { value: 'react', label: 'React' },
  { value: 'vue', label: 'Vue' },
  { value: 'svelte', label: 'Svelte' },
  { value: 'solid', label: 'Solid', disabled: true },
];

test('select: keyboard, naming, value', async ({ page }, info) => {
  await openStory(page, {
    target: target(info),
    id: 'inputs-select',
    props: { options, label: 'Framework', placeholder: 'Pick one' },
  });
  const trigger = page.getByRole('combobox');
  await expect(trigger).toHaveAccessibleName(/Framework/);
  await trigger.focus();
  await page.keyboard.press('Enter');
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect(listbox).toHaveAccessibleName('Framework');
  await expect(listbox).toBeFocused();
  await expect(page.getByRole('option', { name: 'React' })).toHaveAttribute(
    'data-highlighted',
    ''
  );
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Vue' })).toHaveAttribute(
    'data-highlighted',
    ''
  );
  await page.keyboard.press('Enter');
  await expect(trigger).toContainText('Vue');
  await expect(trigger).toHaveAccessibleName(/Framework.*Vue/);
  await expect(listbox).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator('select')).toHaveValue('vue');
});

test('select named by aria-label', async ({ page }, info) => {
  await openStory(page, {
    target: target(info),
    id: 'inputs-select',
    props: { options, placeholder: 'Pick', 'aria-label': 'Framework' },
  });
  const trigger = page.getByRole('combobox');
  await expect(trigger).toHaveAccessibleName('Framework');
  await trigger.click();
  await expect(page.getByRole('listbox')).toHaveAccessibleName('Framework');
});
