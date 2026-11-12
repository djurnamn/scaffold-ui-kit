// A controlled two-way story: the fixture kit's Toggle declares `pressed` as
// a bindable object and its story gives `pressed`, so a click in any pane
// reports `onPressedChange`, which the preview writes back into the story's
// props. Every target pane and the html pane follow, and the address keeps
// the value, so a reload opens the story as it was left. The Svelte pane
// runs the kit's Svelte mode: run once as is (legacy) and once with
// PREVIEW_E2E_SVELTE_MODE=runes. The code view prints the binding a consumer
// writes, React's state, Vue's `v-model` and Svelte's `bind:` in the kit's
// mode, at the story's value as it follows the clicks. The fixture kit's
// Field gives `value` and leaves `marks` to the field: typing mid-text keeps
// the caret in every pane, a value a pane has typed outlasts props the host
// sent before it took the typing, a pane's own marks stay while the story's
// value changes, and the story's class, style and tabindex reach the field's root
// in every pane, React's spelled as React takes them. Run with `pnpm test:e2e`.
import { expect, test, type Page } from '@playwright/test';
import { SCRIPTED_TARGETS, openHost, paneBody, showView } from './support/host';

const toggleIn = (page: Page, target: (typeof SCRIPTED_TARGETS)[number]) =>
  paneBody(page, target).locator('.FixtureToggle');
const htmlToggle = (page: Page) => page.frameLocator('iframe[title="html"]').locator('#app .FixtureToggle');

async function expectPressed(page: Page, pressed: boolean): Promise<void> {
  for (const target of SCRIPTED_TARGETS) {
    await expect(toggleIn(page, target)).toHaveAttribute('aria-pressed', String(pressed));
  }
  await expect(htmlToggle(page)).toHaveAttribute('aria-pressed', String(pressed), { timeout: 30_000 });
}

function addressedProps(page: Page): Record<string, unknown> {
  const props = new URL(page.url()).searchParams.get('props');
  return props === null ? {} : JSON.parse(props);
}

test.describe('A controlled two-way story', () => {
  test('clicks through in every pane, the html and the address following', async ({ page }) => {
    await openHost(page, '/?component=components-toggle&option.shell.events=true');
    await expectPressed(page, false);

    let pressed = false;
    for (const target of SCRIPTED_TARGETS) {
      await toggleIn(page, target).click();
      pressed = !pressed;
      await expectPressed(page, pressed);
      // The story's own value, `false`, leaves the props out of the address.
      await expect.poll(() => addressedProps(page).pressed ?? false).toBe(pressed);
    }
    // Each click logged as any event, from the pane it was made in.
    const entries = page.locator('[data-preview-events] li');
    await expect(entries).toHaveCount(SCRIPTED_TARGETS.length);
    for (const [index, target] of SCRIPTED_TARGETS.entries()) {
      await expect(entries.nth(index)).toContainText(target);
      await expect(entries.nth(index)).toContainText('onPressedChange');
    }

    // The address opens the story as it was left.
    await page.reload();
    await expectPressed(page, pressed);
  });

  test('prints the binding a consumer writes in the code view, at the value the clicks leave', async ({ page }) => {
    await openHost(page, '/?component=components-toggle');
    await showView(page, 'code');
    const source = (target: string) => page.locator(`[data-preview-code="${target}"]`).locator('pre');
    const runes = process.env.PREVIEW_E2E_SVELTE_MODE === 'runes';
    await expect(source('react')).toContainText('const [pressed, setPressed] = useState(false);');
    await expect(source('react')).toContainText('<Toggle pressed={pressed} onPressedChange={setPressed} />');
    await expect(source('vue')).toContainText('const pressed = ref(false);');
    await expect(source('vue')).toContainText('<Toggle v-model="pressed" />');
    await expect(source('svelte')).toContainText(runes ? 'let pressed = $state(false);' : 'let pressed = false;');
    await expect(source('svelte')).toContainText('<Toggle bind:pressed />');
    await expect(source('html')).toContainText('aria-pressed="false"', { timeout: 30_000 });

    await toggleIn(page, 'react').click();
    await expect(source('react')).toContainText('useState(true);');
    await expect(source('vue')).toContainText('ref(true);');
    await expect(source('html')).toContainText('aria-pressed="true"', { timeout: 30_000 });
  });
});

const fieldIn = (page: Page, target: (typeof SCRIPTED_TARGETS)[number]) =>
  paneBody(page, target).locator('.FixtureField');

test.describe('A text field that gives one two-way prop and leaves out another', () => {
  test('keeps the caret where it types, in every pane', async ({ page }) => {
    await openHost(page, '/?component=components-field');
    let value = 'hello';
    for (const target of SCRIPTED_TARGETS) {
      const input = fieldIn(page, target).locator('input');
      await input.click();
      await input.evaluate((element: HTMLInputElement) => element.setSelectionRange(1, 1));
      await input.pressSequentially('XY');
      value = `${value.slice(0, 1)}XY${value.slice(1)}`;
      for (const other of SCRIPTED_TARGETS) await expect(fieldIn(page, other).locator('input')).toHaveValue(value);
      // Only the prop that differs from the story's: its class, style and
      // tabindex stay out of the address.
      await expect.poll(() => addressedProps(page)).toEqual({ value });
    }
  });

  // Vue's generated field puts a controlled input back to its prop's value at
  // the next tick, before the host's write-back arrives: the pane takes the
  // new value itself first, so the caret stays after each typed character.
  test('keeps the caret in the Vue pane, typing one character at a time', async ({ page }) => {
    await openHost(page, '/?component=components-field');
    const input = fieldIn(page, 'vue').locator('input');
    await input.click();
    await input.evaluate((element: HTMLInputElement) => element.setSelectionRange(2, 2));
    for (const [index, character] of [...'abc'].entries()) {
      await input.press(character);
      await expect(input).toHaveValue(`he${'abc'.slice(0, index + 1)}llo`);
      expect(await input.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(3 + index);
    }
    for (const other of SCRIPTED_TARGETS) await expect(fieldIn(page, other).locator('input')).toHaveValue('heabcllo');
    await expect.poll(() => addressedProps(page)).toEqual({ value: 'heabcllo' });
  });

  // A host's props message names the newest of the pane's writes it had
  // taken when it sent the props: one sent before it took the typing, such
  // as another control's change, still holds the old value, which the pane
  // does not take. The pane's report of the typing is held back from the
  // host, so the stale message, the host's last props with the value from
  // before, is the only one the pane gets.
  test('keeps what it typed over props the host sent before it took the typing, in every pane', async ({ page }) => {
    await openHost(page, '/?component=components-field');
    for (const target of SCRIPTED_TARGETS) {
      const input = fieldIn(page, target).locator('input');
      // Keep the host's props as it sends them, after a first keystroke.
      await input.evaluate(() => {
        window.addEventListener('message', (event) => {
          if (event.data?.type === 'preview:props' && event.data.answers !== undefined)
            Object.assign(window, { hostProps: event.data.props, hostAnswers: event.data.answers });
        });
      });
      await input.click();
      await input.press('End');
      await input.press('!');
      const stale = await input.inputValue();
      await expect.poll(() => input.evaluate(() => (window as unknown as { hostProps?: unknown }).hostProps)).toMatchObject({ value: stale });
      const typed = `${stale}?`;
      await input.evaluate(
        (element: HTMLInputElement, [value, older]) => {
          const host = window as unknown as { hostProps: object; hostAnswers: number };
          // Hold the pane's reports back from the host.
          const parent = window.parent as Window & { postMessage: (message: unknown, origin: string) => void };
          const original = parent.postMessage;
          Object.assign(window, { releaseReports: () => (parent.postMessage = original) });
          parent.postMessage = (message: unknown, origin: string) => {
            if ((message as { type?: string })?.type !== 'preview:event') original.call(parent, message, origin);
          };
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
          element.dispatchEvent(new Event('input', { bubbles: true }));
          window.postMessage({ type: 'preview:props', props: { ...host.hostProps, value: older }, answers: host.hostAnswers }, '*');
        },
        [typed, stale] as const,
      );
      await page.waitForTimeout(300);
      await expect(input).toHaveValue(typed);
      await input.evaluate(() => (window as unknown as { releaseReports: () => void }).releaseReports());
    }
  });

  test("keeps each pane's own marks while the story's value changes", async ({ page }) => {
    await openHost(page, '/?component=components-field');
    for (const target of SCRIPTED_TARGETS) {
      await fieldIn(page, target).locator('.FixtureFieldMark').click();
      await expect(fieldIn(page, target).locator('.FixtureFieldMark')).toHaveAttribute('data-marks', '1');
    }
    for (const target of SCRIPTED_TARGETS) {
      const input = fieldIn(page, target).locator('input');
      await input.focus();
      await input.press('End');
      await input.pressSequentially('!');
      for (const other of SCRIPTED_TARGETS)
        await expect(fieldIn(page, other).locator('.FixtureFieldMark')).toHaveAttribute('data-marks', '1');
    }
    for (const other of SCRIPTED_TARGETS) await expect(fieldIn(page, other).locator('input')).toHaveValue('hello!!!');
  });

  test("gives the story's attributes to the field in every pane, React's spelled as React takes them", async ({ page }) => {
    await openHost(page, '/?component=components-field');
    for (const target of SCRIPTED_TARGETS) {
      await expect(fieldIn(page, target)).toHaveClass(/\bFixtureFieldStory\b/);
      await expect(fieldIn(page, target)).toHaveCSS('outline-offset', '3px');
      await expect(fieldIn(page, target)).toHaveAttribute('tabindex', '0');
    }
    await showView(page, 'code');
    const source = (target: string) => page.locator(`[data-preview-code="${target}"]`).locator('pre');
    await expect(source('react')).toContainText('className="FixtureFieldStory"');
    await expect(source('react')).toContainText("style={{ outlineOffset: '3px' }}");
    await expect(source('react')).toContainText('tabIndex={0}');
    await expect(source('vue')).toContainText('style="outline-offset: 3px"');
    await expect(source('vue')).toContainText('class="FixtureFieldStory"');
    await expect(source('svelte')).toContainText('class="FixtureFieldStory"');
    await expect(source('react')).not.toContainText(' class="FixtureFieldStory"');
  });

  test('renders the hint the field names beside it in every pane, the html pane and the code', async ({ page }) => {
    await openHost(page, '/?component=components-field');
    for (const target of SCRIPTED_TARGETS) {
      const hint = paneBody(page, target).locator('#field-hint.FixtureFieldHint');
      await expect(hint).toHaveText('Type to mark the field.');
      await expect(fieldIn(page, target)).toHaveAttribute('aria-describedby', /\bfield-hint\b/);
    }
    await expect(page.frameLocator('iframe[title="html"]').locator('#app #field-hint')).toHaveText('Type to mark the field.', {
      timeout: 30_000,
    });
    await showView(page, 'code');
    const source = (target: string) => page.locator(`[data-preview-code="${target}"]`).locator('pre');
    for (const target of ['react', 'vue', 'svelte', 'html']) await expect(source(target)).toContainText('id="field-hint"');
  });
});

const choiceIn = (page: Page, target: (typeof SCRIPTED_TARGETS)[number]) =>
  paneBody(page, target).locator('select.FixtureChoice');

test.describe('A prop a scenario unsets with null', () => {
  // The fixture kit's Choice starts its select from `defaultValue`, which its
  // story gives and the `no-default` scenario unsets with `null`: every pane
  // leaves the prop out, as the story's code does, so the select starts at
  // its first option in each, Vue's included.
  test('reaches every pane as left out', async ({ page }) => {
    await openHost(page, '/?component=components-choice');
    for (const target of SCRIPTED_TARGETS) await expect(choiceIn(page, target)).toHaveValue('second');
    await openHost(page, '/?component=components-choice&scenario=no-default');
    for (const target of SCRIPTED_TARGETS) await expect(choiceIn(page, target)).toHaveValue('first');
  });
});
