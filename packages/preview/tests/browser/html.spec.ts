// The html pane in the charcell shell, on the development server: beside the
// target panes it shows the markup the selected story renders to, under the
// kit's theme and options and the stylesheets the kit lists for the pane; it
// follows a scenario pick and the editor's props and content, printed by the
// server; it runs none of the story's behavior; and it is toggled like a
// target, the address keeping it. Run with `pnpm test:e2e`.
import { expect, test, type Page } from '@playwright/test';
import { clickToggle, openEditor, openHost, openOutputOptions, paneBody, pick, pickScenario, viewToggle } from './support/host';

/** The html pane's mount element, where the story's markup shows. */
const htmlMount = (page: Page) => page.frameLocator('iframe[title="html"]').locator('#app');

const targetsGroup = (page: Page) => page.getByRole('group', { name: 'targets' });

test.describe('The html pane', () => {
  test("shows the story's markup under the kit's theme and options", async ({ page }) => {
    await openHost(page, '/?component=components-tag');
    await expect(page.locator('iframe[title]')).toHaveCount(4);
    await expect(htmlMount(page).locator('.FixtureTag')).toHaveText('Active', { timeout: 30_000 });
    await expect(htmlMount(page).locator('.FixtureTag')).toHaveAttribute('data-tone', 'calm');
    const document = page.frameLocator('iframe[title="html"]');
    await expect(document.locator('html')).toHaveAttribute('data-fixture-mode', 'light');
    await expect(document.locator('body')).toHaveClass(/is-padded/);
    await expect(document.locator('link[rel="stylesheet"][id$="-theme-css"]')).toHaveAttribute(
      'href',
      /themes\/light\/theme\.css$/,
    );
    // The kit's own stylesheet for the html pane loads there, and in no target's pane.
    await expect(htmlMount(page).locator('.FixtureTag')).toHaveCSS('outline-style', 'dotted');
    await expect(paneBody(page, 'react').locator('.FixtureTag')).not.toHaveCSS('outline-style', 'dotted');
    await openOutputOptions(page);
    await pick(page.getByRole('combobox', { name: 'mode' }), 'dark');
    await expect(document.locator('html')).toHaveAttribute('data-fixture-mode', 'dark');
  });

  test("follows a scenario pick and the editor's props and content", async ({ page }) => {
    await openHost(page, '/?component=components-tag');
    const tag = htmlMount(page).locator('.FixtureTag');
    await expect(tag).toHaveAttribute('data-tone', 'calm', { timeout: 30_000 });
    await pickScenario(page, 'Loud');
    await expect(tag).toHaveAttribute('data-tone', 'loud');

    await pickScenario(page, '(default)');
    await expect(tag).toHaveAttribute('data-tone', 'calm');
    const editor = await openEditor(page);
    await editor.locator('button[data-editor-window="props"]').first().click();
    await pick(editor.getByRole('combobox', { name: 'tone' }), 'loud');
    await expect(tag).toHaveAttribute('data-tone', 'loud');
    // The editor's content: the root's text, printed with the tree.
    await editor.getByRole('textbox').first().fill('Edited');
    await expect(tag).toHaveText('Edited', { timeout: 30_000 });
  });

  test("runs none of the story's behavior", async ({ page }) => {
    await openHost(page, '/?component=components-button');
    // The target pane runs the declared click; the html pane's markup has no handler for it.
    const reactButton = paneBody(page, 'react').locator('.FixtureButton');
    await reactButton.click();
    await expect(reactButton).toHaveAttribute('data-pressed', '');
    const htmlButton = htmlMount(page).locator('.FixtureButton');
    await expect(htmlButton).toHaveText('Button', { timeout: 30_000 });
    expect(
      await htmlMount(page).evaluate((mount) =>
        [...mount.querySelectorAll('*')].flatMap((element) =>
          element.getAttributeNames().filter((name) => name.startsWith('on')),
        ),
      ),
    ).toEqual([]);
    await htmlButton.click();
    await page.waitForTimeout(200);
    await expect(htmlButton).not.toHaveAttribute('data-pressed');
    await expect(htmlMount(page).locator('script')).toHaveCount(0);
  });

  test('is toggled like a target, and the address keeps it', async ({ page }) => {
    await openHost(page, '/?component=components-tag');
    await expect(htmlMount(page).locator('.FixtureTag')).toHaveText('Active', { timeout: 30_000 });
    await clickToggle(targetsGroup(page).getByText('html', { exact: true }));
    await expect(page.locator('iframe[title="html"]')).toHaveCount(0);
    await expect(page).toHaveURL(/[?&]targets=react,vue,svelte(&|$)/);
    // The html source goes with its pane: a code pane under each pane showing.
    await clickToggle(viewToggle(page, 'code'));
    await expect(page.locator('[data-preview-code]')).toHaveCount(3);
    await expect(page.locator('[data-preview-code="html"]')).toHaveCount(0);

    await page.goto('/?component=components-tag&targets=html');
    await expect(htmlMount(page).locator('.FixtureTag')).toHaveText('Active', { timeout: 60_000 });
    await expect(page.locator('iframe[title]')).toHaveCount(1);
    await clickToggle(targetsGroup(page).getByText('react', { exact: true }));
    await expect(page).toHaveURL(/[?&]targets=react,html(&|$)/);
    await expect(page.locator('iframe[title="react"]')).toHaveCount(1);
  });
});
