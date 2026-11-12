// The minimal Svelte shell (`svelte-shell/`), driven against the fixture kit
// on its own development server: proof that the shell contract carries a
// shell of another framework and layout. It mounts, navigates with a select,
// shows options as radio groups and checkboxes, picks scenarios with radio
// buttons, stacks its target panes and the html pane, mounts a view, reorders the editor's
// tree with buttons, and keeps its own options in the address, one of them
// built from the catalog. It shows every scenario of a story in a detached
// pane, each sized to the content it reports, sets the story's props from a
// form, and keeps the props and the visible targets in the address. It
// shows the selection's source per target and as html, following a prop
// edit, and each detached pane's code under it. It lays the story panes out
// at a width picked from the catalog's, which the address keeps. Run with `pnpm test:e2e` (the
// `svelte-shell` project).
import { expect, test, type Page } from '@playwright/test';
import { SCRIPTED_TARGETS, paneBody, positionIn } from './support/host';

const shell = (page: Page) => page.locator('[data-svelte-shell]');

/** Open the host page and wait until every pane shows its story. */
async function openShell(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(shell(page)).toBeVisible({ timeout: 60_000 });
  for (const target of SCRIPTED_TARGETS) {
    await expect(paneBody(page, target)).not.toHaveText('', { timeout: 60_000 });
  }
}

async function navigate(page: Page, label: string): Promise<void> {
  await page.getByLabel('navigation').selectOption({ label });
}

test.describe('The Svelte shell', () => {
  test('shows its page until it mounts: the root gives way, the head stays', async ({ page }) => {
    await page.route('**/host/main.ts*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto('/', { waitUntil: 'commit' });
    const note = page.locator('#root > [data-svelte-shell-note]');
    await expect(note).toHaveText('one moment');
    // The picture beside the page module is served from where it is.
    await expect
      .poll(() =>
        page
          .locator('[data-svelte-shell-mark]')
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)
      )
      .toBe(16);
    await expect(shell(page)).toBeVisible({ timeout: 60_000 });
    await expect(note).toHaveCount(0);
    await expect(page.locator('meta[name="svelte-shell-page"]')).toHaveAttribute('content', 'start');
  });

  test('mounts in place of the charcell shell, its panes stacked', async ({ page }) => {
    await openShell(page);
    await expect(page.locator('[data-preview-shell-problem]')).toHaveCount(0);
    await expect(page.locator('.application')).toHaveCount(0);
    const boxes = await Promise.all(
      SCRIPTED_TARGETS.map((target) => page.locator(`iframe[title="${target}"]`).boundingBox()),
    );
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]!.x).toBe(boxes[0]!.x);
      expect(boxes[i]!.y).toBeGreaterThan(boxes[i - 1]!.y + boxes[i - 1]!.height - 1);
    }
  });

  test("stacks the html pane with the targets', following the options", async ({ page }) => {
    await openShell(page);
    await navigate(page, 'Tag');
    const html = page.frameLocator('iframe[title="html"]');
    await expect(html.locator('#app .FixtureTag')).toHaveText('Active', { timeout: 30_000 });
    await expect(page.locator('[data-pane="html"]')).toHaveAttribute('data-readiness', 'ready');
    await page.getByRole('group', { name: 'mode' }).getByRole('radio', { name: 'dark' }).check();
    await expect(html.locator('html')).toHaveAttribute('data-fixture-mode', 'dark');
  });

  test('selecting a component renders it in all three panes', async ({ page }) => {
    await openShell(page);
    await navigate(page, 'Tag');
    await expect(page).toHaveURL(/[?&]component=components-tag(&|$)/);
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureTag')).toHaveText('Active');
    }
  });

  test('lists no unlisted story in its navigation, and opens one at its address', async ({ page }) => {
    await openShell(page);
    const labels = await page.getByLabel('navigation').locator('option').allTextContents();
    expect(labels).toContain('Tag');
    expect(labels).not.toContain('Probe');
    expect(labels).not.toContain('Faulty');
    await openShell(page, '/?component=components-probe');
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureProbe')).toHaveText('probe');
    }
  });

  test('a choice option is a radio group that reaches the iframes', async ({ page }) => {
    await openShell(page);
    await page.getByRole('group', { name: 'mode' }).getByRole('radio', { name: 'dark' }).check();
    await expect(page).toHaveURL(/[?&]option\.mode=dark(&|$)/);
    for (const target of SCRIPTED_TARGETS) {
      await expect(page.frameLocator(`iframe[title="${target}"]`).locator('html')).toHaveAttribute(
        'data-fixture-mode',
        'dark',
      );
    }
  });

  test('a story option is a checkbox that applies to the story', async ({ page }) => {
    await openShell(page);
    const padded = page.getByRole('checkbox', { name: 'padded' });
    await expect(padded).toBeChecked();
    await expect(paneBody(page, 'react')).toHaveClass(/is-padded/);
    await padded.uncheck();
    await expect(page).toHaveURL(/[?&]option\.padded=false(&|$)/);
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target)).not.toHaveClass(/is-padded/);
    }
  });

  test('picking a scenario changes the panes', async ({ page }) => {
    await openShell(page);
    await navigate(page, 'IconLabel');
    const scenario = page.getByRole('group', { name: 'scenario' });
    await expect(scenario.getByRole('radio', { name: 'Icon and label (default)' })).toBeChecked();
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureIconLabel__label')).not.toHaveText('');
    }
    await scenario.getByRole('radio', { name: 'Icon only' }).check();
    await expect(page).toHaveURL(/[?&]scenario=icon-only(&|$)/);
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureIconLabel__label')).toHaveText('');
    }
  });

  test('the shell option density lands in the address and changes the layout', async ({ page }) => {
    await openShell(page);
    await expect(shell(page)).toHaveClass(/density-compact/);
    await page.getByRole('group', { name: 'density' }).getByRole('radio', { name: 'roomy' }).check();
    await expect(page).toHaveURL(/[?&]option\.shell\.density=roomy(&|$)/);
    await expect(shell(page)).toHaveClass(/density-roomy/);

    await openShell(page, '/?option.shell.density=roomy');
    await expect(shell(page)).toHaveClass(/density-roomy/);
    await expect(page.getByRole('group', { name: 'density' }).getByRole('radio', { name: 'roomy' })).toBeChecked();
  });

  test('a view mounts in its own pane', async ({ page }) => {
    await openShell(page);
    await navigate(page, 'Swatches');
    await expect(page).toHaveURL(/[?&]view=swatches(&|$)/);
    await expect(page.frameLocator('iframe[title="swatches"]').locator('body')).toContainText('mode: light', {
      timeout: 30_000,
    });
    await expect(page.locator('iframe[title="react"]')).toHaveCount(0);
    // A view has no story, so the controller lists the story options as unavailable.
    await expect(page.getByRole('checkbox', { name: 'padded' })).toHaveCount(0);
  });

  test('the editor reorders with up and down, and the panes follow', async ({ page }) => {
    await openShell(page);
    await navigate(page, 'Tag');
    await page.getByRole('button', { name: 'open editor' }).click();
    const editor = page.getByRole('complementary', { name: 'editor' });
    await expect(editor.getByRole('textbox')).toHaveValue('Active');

    await editor.getByRole('button', { name: 'add text' }).first().click();
    await expect(editor.getByRole('status')).toHaveText(/pending/);
    // The first regeneration compiles the emitters on the server.
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target)).toContainText('New text', { timeout: 30_000 });
    }
    await expect(editor.getByRole('status')).toHaveText(/idle/);
    for (const target of SCRIPTED_TARGETS) {
      expect(await positionIn(page, target, 'Active')).toBeLessThan(await positionIn(page, target, 'New text'));
    }

    // Move the first node down: the new text now comes first.
    await editor.getByRole('button', { name: 'down' }).first().click();
    await expect(editor.getByRole('textbox').first()).toHaveValue('New text');
    for (const target of SCRIPTED_TARGETS) {
      await expect
        .poll(async () => (await positionIn(page, target, 'New text')) < (await positionIn(page, target, 'Active')), {
          timeout: 30_000,
        })
        .toBe(true);
    }
    await expect(editor.getByRole('status')).toHaveText(/idle/);
  });

  test('hiding a target removes its pane, and the address keeps it hidden', async ({ page }) => {
    await openShell(page);
    // An untouched page keeps its address.
    await expect(page).toHaveURL(/\/$/);
    const vue = page.getByRole('group', { name: 'targets' }).getByRole('checkbox', { name: 'vue' });
    await vue.uncheck();
    await expect(page.locator('iframe[title="vue"]')).toHaveCount(0);
    await expect(page.locator('iframe[title="react"]')).toHaveCount(1);
    await expect(page.locator('iframe[title="svelte"]')).toHaveCount(1);
    await expect(page).toHaveURL(/[?&]targets=react,svelte,html(&|$)/);

    await page.goto('/?targets=react,svelte,html');
    await expect(paneBody(page, 'react')).not.toHaveText('', { timeout: 60_000 });
    await expect(page.locator('iframe[title="vue"]')).toHaveCount(0);
    await expect(vue).not.toBeChecked();
    await vue.check();
    await expect(page.locator('iframe[title="vue"]')).toHaveCount(1);
    await expect(page).not.toHaveURL(/[?&]targets=/);
  });

  test("a shell option built from the catalog offers the kit's targets", async ({ page }) => {
    await openShell(page);
    const focus = page.getByRole('group', { name: 'focus' });
    // `all`, then the kit's targets and html.
    await expect(focus.getByRole('radio')).toHaveCount(1 + SCRIPTED_TARGETS.length + 1);
    await focus.getByRole('radio', { name: 'vue' }).check();
    await expect(page).toHaveURL(/[?&]option\.shell\.focus=vue(&|$)/);
    await expect(page.locator('iframe[title="vue"]')).toHaveCount(1);
    await expect(page.locator('iframe[title="react"]')).toHaveCount(0);
    await expect(page.locator('iframe[title="svelte"]')).toHaveCount(0);
    await expect(page.locator('iframe[title="html"]')).toHaveCount(0);
  });

  test("shows every scenario of the story in a detached pane, apart from the selection's", async ({ page }) => {
    await openShell(page);
    await navigate(page, 'IconLabel');
    const gallery = page.getByRole('region', { name: 'scenarios' });
    await expect(gallery.locator('figure')).toHaveCount(2);
    await expect(gallery.locator('figure[data-scenario="icon-only"]')).toHaveAttribute('data-readiness', 'ready', {
      timeout: 30_000,
    });
    const iconOnly = page.frameLocator('iframe[title="IconLabel: Icon only (react)"]');
    const withLabel = page.frameLocator('iframe[title="IconLabel: Icon and label (react)"]');
    await expect(iconOnly.locator('.FixtureIconLabel__label')).toHaveText('');
    await expect(withLabel.locator('.FixtureIconLabel__label')).toHaveText('Label');
    // The selection stays on its own scenario.
    await expect(paneBody(page, 'react').locator('.FixtureIconLabel__label')).toHaveText('Label');

    // A global option reaches the detached panes too.
    await page.getByRole('group', { name: 'mode' }).getByRole('radio', { name: 'dark' }).check();
    await expect(iconOnly.locator('html')).toHaveAttribute('data-fixture-mode', 'dark');
  });

  test('sizes each scenario pane to the story it shows, and follows an option that resizes it', async ({ page }) => {
    await openShell(page);
    await navigate(page, 'IconLabel');
    const figure = page.getByRole('region', { name: 'scenarios' }).locator('figure[data-scenario="icon-only"]');
    await expect(figure).toHaveAttribute('data-content-height', /^\d+$/, { timeout: 30_000 });
    const iframe = page.locator('iframe[title="IconLabel: Icon only (react)"]');
    const reported = async () => Number(await figure.getAttribute('data-content-height'));
    const paneHeight = () => iframe.evaluate((element) => (element as HTMLIFrameElement).clientHeight);
    // Whether the story ends inside the pane, so none of it is cut off.
    const storyFits = () =>
      iframe.evaluate((element) => {
        const frame = (element as HTMLIFrameElement).contentWindow!;
        return frame.document.getElementById('app')!.getBoundingClientRect().bottom <= frame.innerHeight;
      });

    // The first reports can come before the story's fonts and layout settle,
    // as they may under load: take the height once it holds still.
    await expect
      .poll(
        async () => {
          const first = await reported();
          await page.waitForTimeout(250);
          return first === (await reported()) ? first : -1;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
    const before = await reported();
    // Smaller than the fixed height the pane had, and holding the whole story.
    expect(before).toBeLessThan(70);
    await expect.poll(paneHeight).toBe(before);
    expect(await storyFits()).toBe(true);
    // Sized to it, the pane reports the same height again: the canvas's
    // `min-height: 100vh` does not feed back into the size.
    await page.waitForTimeout(500);
    expect(await reported()).toBe(before);
    expect(await paneHeight()).toBe(before);

    // The outline option puts 12px around the story, and the pane follows.
    await page.getByRole('checkbox', { name: 'outline' }).check();
    await expect.poll(reported).toBe(before + 24);
    await expect.poll(paneHeight).toBe(before + 24);
    expect(await storyFits()).toBe(true);
    await page.getByRole('checkbox', { name: 'outline' }).uncheck();
    await expect.poll(paneHeight).toBe(before);
  });

  test("a props form sets the story's props, which the address keeps", async ({ page }) => {
    await openShell(page);
    await navigate(page, 'IconLabel');
    const props = page.getByRole('group', { name: 'props' });
    const label = props.getByRole('textbox', { name: /label/ });
    await expect(label).toHaveValue('Label');
    await expect(props).toContainText('string');
    await label.fill('Hello');
    for (const target of SCRIPTED_TARGETS) {
      await expect(paneBody(page, target).locator('.FixtureIconLabel__label')).toHaveText('Hello');
    }
    await expect(page).toHaveURL(/[?&]props=%7B%22label%22:%22Hello%22%7D(&|$)/);
    // The detached panes keep their scenario's props.
    await expect(
      page.frameLocator('iframe[title="IconLabel: Icon and label (react)"]').locator('.FixtureIconLabel__label'),
    ).toHaveText('Label');

    await openShell(page, '/?component=components-iconlabel&props=%7B%22label%22:%22Hello%22%7D');
    await expect(props.getByRole('textbox', { name: /label/ })).toHaveValue('Hello');
    await expect(paneBody(page, 'vue').locator('.FixtureIconLabel__label')).toHaveText('Hello');
  });

  test("shows the selection's source per target and as html, and each detached pane's code", async ({ page }) => {
    await openShell(page);
    await navigate(page, 'IconLabel');
    const source = page.getByRole('region', { name: 'source' });
    await expect(source.locator('figure[data-source="react"] pre')).toContainText(
      "import { IconLabel, Dot } from 'fixture-kit/react';",
    );
    await expect(source.locator('figure[data-source="vue"] pre')).toContainText('<template #icon>');
    await expect(source.locator('figure[data-source="svelte"] pre')).toContainText('{#snippet icon()}');
    const html = source.locator('figure[data-source="html"]');
    await expect(html).toHaveAttribute('data-html-status', 'ready', { timeout: 30_000 });
    await expect(html.locator('pre')).toContainText('<span class="FixtureIconLabel__label">Label</span');

    // A prop edit reaches the source, html included.
    await page.getByRole('group', { name: 'props' }).getByRole('textbox', { name: /label/ }).fill('Hello');
    await expect(source.locator('figure[data-source="react"] pre')).toContainText('label="Hello"');
    await expect(html.locator('pre')).toContainText('>Hello</span', { timeout: 30_000 });

    // Each detached pane's code, printed for its own scenario.
    const gallery = page.getByRole('region', { name: 'scenarios' });
    await expect(gallery.getByLabel('Icon only code')).toContainText('<IconLabel label="" icon={<Dot />} />');
    await expect(gallery.getByLabel('Icon and label (default) code')).toContainText('<IconLabel icon={<Dot />} />');
  });

  test("lays the story panes out at a width picked from the catalog's, which the address keeps", async ({ page }) => {
    /** The width a target pane's story is laid out at. */
    const laidOutAt = (target: (typeof SCRIPTED_TARGETS)[number]) =>
      paneBody(page, target).evaluate((body) => body.ownerDocument.defaultView!.innerWidth);
    await openShell(page);
    const width = page.getByRole('group', { name: 'width', exact: true });
    await expect(width.getByRole('radio', { name: 'fit' })).toBeChecked();
    await width.getByRole('radio', { name: 'large 1280' }).check();
    await expect(page).toHaveURL(/[?&]width=1280(&|$)/);
    for (const target of SCRIPTED_TARGETS) await expect.poll(() => laidOutAt(target)).toBe(1280);
    await width.getByRole('radio', { name: 'fit' }).check();
    await expect(page).not.toHaveURL(/[?&]width=/);
    await expect.poll(() => laidOutAt('react')).not.toBe(1280);

    await openShell(page, '/?width=375');
    await expect(width.getByRole('radio', { name: 'small 375' })).toBeChecked();
    await expect.poll(() => laidOutAt('vue')).toBe(375);

    // A width a link names that is not among the catalog's shows as its number.
    await openShell(page, '/?width=500');
    await expect(width.getByRole('radio', { name: '500', exact: true })).toBeChecked();
    await expect.poll(() => laidOutAt('svelte')).toBe(500);
  });
});
