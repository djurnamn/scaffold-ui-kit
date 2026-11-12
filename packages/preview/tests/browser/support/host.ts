// What the interaction specs share about the host page: the target panes
// and how to read them, the charcell shell's selects (a trigger opening a
// listbox, not a native select), its views, and the first wait on a page,
// until every pane has rendered its story.
import { expect, type Locator, type Page } from '@playwright/test';

export const SCRIPTED_TARGETS = ['react', 'vue', 'svelte'] as const;
export type Target = (typeof SCRIPTED_TARGETS)[number];

/** The body of a target pane's document. */
export function paneBody(page: Page, target: Target): Locator {
  return page.frameLocator(`iframe[title="${target}"]`).locator('body');
}

/** Choose an option of one of the shell's selects by its label. */
export async function pick(trigger: Locator, name: string): Promise<void> {
  await trigger.click();
  await trigger.page().getByRole('option', { name, exact: true }).click();
}

/**
 * Open the host page and wait until every pane shows text: the first story
 * (Button) renders its label, so a non-empty body means the pane has loaded
 * and handshaked. The first load compiles the kit, so the wait is generous.
 */
export async function openHost(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  for (const target of SCRIPTED_TARGETS) {
    await expect
      .poll(
        async () =>
          (
            await paneBody(page, target)
              .innerText()
              .catch(() => '')
          ).trim().length,
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);
  }
}

/** Select a component story from the navigation's tree. */
export async function selectStory(page: Page, name: string): Promise<void> {
  await page.getByRole('treeitem', { name, exact: true }).click();
}

/** One of the stage's views, `scenario`, `output` or `code`, in the top bar's
 *  views group: the element to click. */
export function viewToggle(page: Page, view: string): Locator {
  return page.getByRole('group', { name: 'views' }).getByText(view, { exact: true });
}

/**
 * Click a toggle, then move the pointer off it: a toggle's hint opens on
 * hover, below it, and a hint left open there could cover the next control
 * a spec clicks (an option's toggle under another, a bar's under the top
 * bar's).
 */
export async function clickToggle(toggle: Locator): Promise<void> {
  await toggle.click();
  await toggle.page().mouse.move(0, 0);
  await expect(toggle.page().getByRole('tooltip')).toHaveCount(0);
}

/** Show or hide one of the stage's views, unless it already is. */
export async function showView(page: Page, view: string, shown = true): Promise<void> {
  const checkbox = page.getByRole('group', { name: 'views' }).getByRole('checkbox', { name: view, exact: true });
  if ((await checkbox.isChecked()) !== shown) await clickToggle(viewToggle(page, view));
  await expect(checkbox).toBeChecked({ checked: shown });
}

/** Pick a scenario from the scenario row's picker, showing the row first. */
export async function pickScenario(page: Page, name: string): Promise<void> {
  await showView(page, 'scenario');
  await pick(page.getByTestId('select-scenario'), name);
}

/** Open the scenario editor, which shows with the scenario row, and return it. */
export async function openEditor(page: Page): Promise<Locator> {
  await showView(page, 'scenario');
  const editor = page.locator('[data-preview-editor]');
  await expect(editor).toBeVisible();
  return editor;
}

/** Open the output view's options popout, where the context options are,
 *  unless it is open, and return it. */
export async function openOutputOptions(page: Page): Promise<Locator> {
  const options = page.getByRole('dialog', { name: 'output options' });
  if (!(await options.isVisible())) await page.getByRole('main').getByRole('button', { name: 'options…' }).click();
  await expect(options).toBeVisible();
  return options;
}

/** The toggle of a boolean option, found by its accessible name, the
 *  option's label: the element to click, with its checkbox inside for the
 *  state. */
export function optionToggle(page: Page, label: string): Locator {
  return page.getByRole('checkbox', { name: label, exact: true }).locator('xpath=..');
}

/** Where `text` sits in a pane's text, or -1. */
export async function positionIn(page: Page, target: Target, text: string): Promise<number> {
  return (await paneBody(page, target).innerText()).indexOf(text);
}
