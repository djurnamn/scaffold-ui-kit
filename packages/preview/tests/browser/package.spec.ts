// The packed-install smoke test: the preview installed from its tarball into
// a kit outside the workspace, with charcell beside it, built into a static
// preview and loaded once from a subpath, `/kit/`, with nothing served at the
// domain's root. It checks that the shell shipped by path mounts from
// node_modules, that its optional peer resolves, that a pane renders a story,
// and that the iframes load from the subpath even after the address moves.
// The html code pane and the html pane show the html the build printed for a
// curated scenario, and say it is unavailable for changed props. Run with `pnpm test:package`;
// the server (support/package-server.mjs) does the packing, installing and
// building.
import { expect, test } from '@playwright/test';
import { openOutputOptions, showView } from './support/host';

test('the installed preview mounts the charcell shell and renders a story', async ({ page }) => {
  const response = await page.goto('/kit/');
  expect(response?.ok()).toBe(true);
  await expect(page.locator('[data-preview-shell-problem]')).toHaveCount(0);
  // The shell: the navigation lists the kit's stories.
  await expect(page.getByRole('treeitem', { name: 'Tag', exact: true })).toBeVisible();
  await expect(page.getByTestId('select-component')).toHaveValue('Button');
  // The panes: the first story renders in each target.
  for (const target of ['react', 'vue', 'svelte']) {
    await expect(page.frameLocator(`iframe[title="${target}"]`).locator('.FixtureButton')).toHaveText('Button', {
      timeout: 30_000,
    });
  }
  // The static build has no regeneration, so the scenario row holds no
  // editor; and it cannot render the Empty scenario, so it is not offered:
  // Button has no other scenario, so there is no picker either, only the
  // story's context in the output's options.
  await showView(page, 'scenario');
  await expect((await openOutputOptions(page)).getByText('padded', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-preview-editor]')).toHaveCount(0);
  await expect(page.getByTestId('select-scenario')).toHaveCount(0);
  // A shell may route in the address; the iframes still load from the subpath.
  await page.evaluate(() => history.replaceState(history.state, '', '/kit/some/route#section'));
  // A view mounts from the static build too, its theme stylesheet with it.
  await page.getByRole('navigation').getByText('Swatches', { exact: true }).click();
  const view = page.frameLocator('iframe[title="swatches"]');
  await expect(view.locator('body')).toContainText('mode: light');
  await expect(page.locator('iframe[title="swatches"]')).toHaveAttribute(
    'src',
    /^http:\/\/localhost:\d+\/kit\/preview\/view\/view\.html\?view=swatches/,
  );
  const themeLoaded = await view
    .locator('link[rel="stylesheet"][id$="-theme-css"]')
    .evaluate((link: HTMLLinkElement) => link.sheet !== null && link.href.includes('/kit/themes/'));
  expect(themeLoaded).toBe(true);
});

test("the static build carries the charcell shell's page: the font preloaded from the build's own files and the note on whole cells", async ({
  page,
}) => {
  await page.route('**/assets/*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto('/kit/', { waitUntil: 'commit' });
  const note = page.locator('.PreviewPageLoading');
  await expect(note).toBeAttached();
  const preload = page.locator('link[rel="preload"][as="font"]');
  await expect(preload).toHaveAttribute('href', /assets\/OverpassMono-[\w-]+\.woff2$/);
  const font = await preload.evaluate((link: HTMLLinkElement) => link.href);
  expect((await page.request.get(font)).ok()).toBe(true);
  await expect
    .poll(() => note.evaluate((element) => getComputedStyle(element, '::after').visibility))
    .toBe('visible');
  const placed = await note.evaluate(async (element) => {
    await document.fonts.ready;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:1ch';
    element.append(probe);
    const cell = probe.getBoundingClientRect().width;
    probe.remove();
    const style = getComputedStyle(element, '::after');
    return {
      face: document.fonts.check('14px "Charcell Overpass Mono"'),
      cell,
      across: parseFloat(style.left) / cell,
      down: parseFloat(style.top) / (cell * 2),
    };
  });
  expect(placed.face).toBe(true);
  expect(placed.cell).toBe(8);
  expect(Number.isInteger(placed.across)).toBe(true);
  expect(Number.isInteger(placed.down)).toBe(true);
  // The shell mounts over the note, and the ground stays dark.
  await expect(page.getByRole('treeitem', { name: 'Tag', exact: true })).toBeVisible();
  await expect(note).toHaveCount(0);
});

test("the html code pane shows a scenario's html printed at build time, and none for changed props", async ({ page }) => {
  await page.goto('/kit/?component=components-tag&option.shell.code=true&option.shell.scenario=true');
  const html = page.locator('[data-preview-code="html"]');
  await expect(html.locator('pre')).toHaveText('<span class="FixtureTag" data-tone="calm">Active</span>\n', {
    timeout: 30_000,
  });
  // A curated scenario's html.
  await page.getByTestId('select-scenario').click();
  await page.getByRole('option', { name: 'Loud', exact: true }).click();
  await expect(html.locator('pre')).toHaveText('<span class="FixtureTag" data-tone="loud">Active</span>\n');
  // The target source is printed in the page, whatever the props.
  await page.goto('/kit/?component=components-tag&props=%7B%22tone%22%3A%22loud%22%7D&option.shell.code=true');
  await expect(page.locator('[data-preview-code="react"] pre')).toContainText('return <Tag tone="loud">Active</Tag>;', {
    timeout: 30_000,
  });
  await expect(html.getByRole('status')).toHaveText('unavailable');
  await expect(html).toContainText(
    'The static build prints html for the scenarios alone: there is none for changed props or edited content.',
  );
  await expect(html.locator('pre')).toHaveCount(0);
});

test("the html pane shows a scenario's html printed at build time, and says why there is none for changed props", async ({
  page,
}) => {
  await page.goto('/kit/?component=components-tag&option.shell.scenario=true');
  const html = page.frameLocator('iframe[title="html"]');
  await expect(page.locator('iframe[title="html"]')).toHaveAttribute(
    'src',
    /^http:\/\/localhost:\d+\/kit\/preview\/html\/preview\.html/,
  );
  await expect(html.locator('#app .FixtureTag')).toHaveAttribute('data-tone', 'calm', { timeout: 30_000 });
  const themeLoaded = await html
    .locator('link[rel="stylesheet"][id$="-theme-css"]')
    .evaluate((link: HTMLLinkElement) => link.sheet !== null && link.href.includes('/kit/themes/'));
  expect(themeLoaded).toBe(true);
  await page.getByTestId('select-scenario').click();
  await page.getByRole('option', { name: 'Loud', exact: true }).click();
  await expect(html.locator('#app .FixtureTag')).toHaveAttribute('data-tone', 'loud');

  await page.goto('/kit/?component=components-tag&props=%7B%22tone%22%3A%22loud%22%7D');
  await expect(html.locator('#app [data-preview-html-unavailable]')).toHaveText(
    'The static build prints html for the scenarios alone: there is none for changed props or edited content.',
    { timeout: 30_000 },
  );
  await expect(html.locator('#app .FixtureTag')).toHaveCount(0);
});
