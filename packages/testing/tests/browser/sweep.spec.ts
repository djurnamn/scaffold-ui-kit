// The browser sweep over a slice of the preview's fixture kit, in the target
// of each project: axe and a keyboard walk over each component's default
// props and scenarios, with the field's known violation accepted.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';
import {
  gotoPreview,
  mountStory,
  readRenderError,
  setOptions,
  setProps,
  settle,
  waitForStory,
  type PreviewScriptedTarget,
} from '@scaffold-ui-kit/preview/testing';

import {
  readPreviewManifest,
  scanAccessibility,
  sweepPreview,
  walkKeyboard,
  type KnownViolation,
} from '../../src/browser/index.js';

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), '.kit');

const SLICE = ['components-button', 'components-iconlabel', 'components-field'];

const KNOWN: KnownViolation[] = [
  {
    rule: 'label',
    component: 'components-field',
    states: ['default'],
    reason:
      "The fixture field's input has no label; the field is a fixture for two-way values.",
  },
];

type WalkWatchWindow = Window & { startingStopFocus: number };

/** Count how often the stop before the mount takes focus before the first key
 *  press of a walk. */
async function countStartingStopFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const watched = window as unknown as WalkWatchWindow;
    watched.startingStopFocus = 0;
    let pressed = false;
    document.addEventListener('keydown', () => (pressed = true), true);
    document.addEventListener('focusin', (event) => {
      const position = (event.target as HTMLElement).getAttribute(
        'data-keyboard-walk-sentinel'
      );
      if (!pressed && position === 'beforebegin') {
        watched.startingStopFocus += 1;
      }
    });
  });
}

function readStartingStopFocus(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as WalkWatchWindow).startingStopFocus
  );
}

test('sweeps the slice with axe and the keyboard', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  const components = readPreviewManifest(kitRoot).filter((component) =>
    SLICE.includes(component.id)
  );
  expect(components.map((component) => component.id).sort()).toEqual(
    [...SLICE].sort()
  );
  const result = await sweepPreview(page, components, { target, known: KNOWN });
  expect(result.failures).toEqual([]);
  expect(result.stale).toEqual([]);
  expect(
    result.sweeps.find((sweep) => sweep.component === 'components-field')
      ?.occurred
  ).toHaveLength(1);
});

test('walks the field in document order and back', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await mountStory(page, 'components-field', { value: 'hello', tabindex: 0 });
  await expect(page.locator('.FixtureFieldInput')).toBeVisible();
  await settle(page);
  const walk = await walkKeyboard(page);
  expect(walk.expected).toEqual([
    'div.FixtureField',
    'input.FixtureFieldInput',
    'button.FixtureFieldMark',
  ]);
  expect(walk.forward).toEqual(walk.expected);
  expect(walk.backward).toEqual([...walk.expected].reverse());
  expect(walk.failures).toEqual([]);
  // The walk leaves the page as it found it.
  await expect(
    page.locator('[data-keyboard-walk], [data-keyboard-walk-sentinel]')
  ).toHaveCount(0);
});

test('reports a walk that skips an element', async ({ page }, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await mountStory(page, 'components-field', { value: 'hello' });
  await expect(page.locator('.FixtureFieldInput')).toBeVisible();
  await settle(page);
  // Tab skips the input once it moves focus on to the button.
  await page.evaluate(() => {
    const input =
      document.querySelector<HTMLInputElement>('.FixtureFieldInput')!;
    input.addEventListener('focus', () =>
      document.querySelector<HTMLButtonElement>('.FixtureFieldMark')!.focus()
    );
  });
  const walk = await walkKeyboard(page);
  expect(walk.failures).toHaveLength(2);
  expect(walk.failures[0]).toContain(
    'Tab: expected input.FixtureFieldInput → button.FixtureFieldMark; focus went to button.FixtureFieldMark'
  );
});

test('rejects a story id the page has not, and an option it does not define', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await expect(mountStory(page, 'components-buton')).rejects.toThrow(
    /no story with the id 'components-buton'\. Its stories: .*components-button/
  );
  await expect(setOptions(page, { colorScheme: 'dark' })).rejects.toThrow(
    /no option 'colorScheme'\. Its options: .*mode/
  );
});

test('describes an element by its id, or by at most three classes', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await mountStory(page, 'components-field', { value: 'hello' });
  await expect(page.locator('.FixtureFieldInput')).toBeVisible();
  await settle(page);
  await page.evaluate(() => {
    const mark = document.querySelector('.FixtureFieldMark')!;
    mark.insertAdjacentHTML(
      'afterend',
      '<button id="named" class="a b c d e">Named</button>' +
        '<button class="a b c d e">Classes</button>'
    );
  });
  const walk = await walkKeyboard(page);
  expect(walk.expected.slice(-2)).toEqual(['button#named', 'button.a.b.c']);
});

test('walks a scrolling region with no focusable element as a tab stop', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await mountStory(page, 'components-field', { value: 'hello' });
  await expect(page.locator('.FixtureFieldInput')).toBeVisible();
  await settle(page);
  // Chromium stops Tab on a scroller it cannot otherwise reach: one with
  // only a tabindex="-1" child counts, one with a focusable child does not,
  // a nested scroller takes the stop from the one around it, and a region
  // that does not overflow or hides its overflow is no stop.
  await page.evaluate(() => {
    const box = 'overflow:auto;height:40px;width:80px';
    const tall = '<div style="height:400px"></div>';
    document
      .querySelector('.FixtureFieldMark')!
      .insertAdjacentHTML(
        'afterend',
        `<div class="Scrolls" style="${box}"><button tabindex="-1">x</button>${tall}</div>` +
          `<div class="HasButton" style="${box}"><button class="Inner">x</button>${tall}</div>` +
          `<div class="Outer" style="${box}"><div class="Nested" style="${box}">${tall}</div>${tall}</div>` +
          `<div class="Hidden" style="overflow:hidden;height:40px">${tall}</div>` +
          `<div class="Short" style="overflow:auto;height:40px"></div>`
      );
  });
  const walk = await walkKeyboard(page);
  expect(walk.expected).toEqual([
    'input.FixtureFieldInput',
    'button.FixtureFieldMark',
    'div.Scrolls',
    'button.Inner',
    'div.Nested',
  ]);
  expect(walk.forward).toEqual(walk.expected);
  expect(walk.backward).toEqual([...walk.expected].reverse());
  expect(walk.failures).toEqual([]);
});

test('counts the segments of a date input as one stop', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await mountStory(page, 'components-field', { value: 'hello' });
  await expect(page.locator('.FixtureFieldInput')).toBeVisible();
  await settle(page);
  await page.evaluate(() => {
    document
      .querySelector('.FixtureFieldMark')!
      .insertAdjacentHTML(
        'afterend',
        '<input class="Date" type="date"><input class="Moment" type="datetime-local">' +
          '<input class="Clock" type="time"><input class="Month" type="month">' +
          '<input class="Week" type="week">'
      );
  });
  const walk = await walkKeyboard(page);
  expect(walk.forward).toEqual(walk.expected);
  expect(walk.expected.slice(-5)).toEqual([
    'input.Date',
    'input.Moment',
    'input.Clock',
    'input.Month',
    'input.Week',
  ]);
  expect(walk.backward).toEqual([...walk.expected].reverse());
  expect(walk.failures).toEqual([]);
});

test('reports a plain element that swallows one Tab', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await mountStory(page, 'components-field', { value: 'hello' });
  await expect(page.locator('.FixtureFieldInput')).toBeVisible();
  await settle(page);
  await page.evaluate(() => {
    document.querySelector('.FixtureFieldInput')!.addEventListener(
      'keydown',
      (event) => {
        if ((event as KeyboardEvent).key === 'Tab') event.preventDefault();
      },
      { once: true }
    );
  });
  const walk = await walkKeyboard(page);
  expect(walk.failures[0]).toContain(
    'focus went to input.FixtureFieldInput → input.FixtureFieldInput → button.FixtureFieldMark'
  );
});

test('reports a date input that focus never leaves', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await mountStory(page, 'components-field', { value: 'hello' });
  await expect(page.locator('.FixtureFieldInput')).toBeVisible();
  await settle(page);
  await page.evaluate(() => {
    const mark = document.querySelector('.FixtureFieldMark')!;
    mark.insertAdjacentHTML('afterend', '<input class="Date" type="date">');
    document.querySelector('.Date')!.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Tab') event.preventDefault();
    });
  });
  const walk = await walkKeyboard(page);
  expect(walk.failures[0]).toContain('input.Date → input.Date');
});

test('walks a contenteditable editing host as a tab stop of the mount', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await mountStory(page, 'components-field', { value: 'hello' });
  await expect(page.locator('.FixtureFieldInput')).toBeVisible();
  await settle(page);
  // Chromium reports a contenteditable host's tabIndex as -1, yet Tab stops
  // on it; a link or an editable element inside it is part of the host, and
  // Tab leaves the host past them, while the content of a non-editable
  // island inside it is tabbable again.
  await page.evaluate(() => {
    const editor = document.createElement('div');
    editor.className = 'FixtureEditor';
    editor.contentEditable = 'true';
    editor.innerHTML =
      '<p contenteditable="true">Text <a href="#note">a link</a></p>' +
      '<span contenteditable="false"><button class="FixtureIsland">Island</button></span>';
    document.querySelector('.FixtureFieldMark')!.after(editor);
  });
  const walk = await walkKeyboard(page);
  expect(walk.expected).toEqual([
    'input.FixtureFieldInput',
    'button.FixtureFieldMark',
    'div.FixtureEditor',
    'button.FixtureIsland',
  ]);
  expect(walk.forward).toEqual(walk.expected);
  expect(walk.backward).toEqual([...walk.expected].reverse());
  expect(walk.failures).toEqual([]);
});

test('reads focus once it settles, after a control that refocuses a frame later', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await mountStory(page, 'components-field', { value: 'hello' });
  await expect(page.locator('.FixtureFieldInput')).toBeVisible();
  await settle(page);
  // As a select-on-focus field does, the input acts on its focus a frame
  // later: here it focuses itself again, which a read straight after the key
  // press would race.
  await page.evaluate(() => {
    const input =
      document.querySelector<HTMLInputElement>('.FixtureFieldInput')!;
    input.addEventListener('focus', () =>
      requestAnimationFrame(() => input.focus())
    );
  });
  for (let run = 0; run < 3; run += 1) {
    const walk = await walkKeyboard(page);
    expect(walk.failures, `run ${run + 1}`).toEqual([]);
  }
});

for (const { frames, when } of [
  { frames: 1, when: 'within a frame' },
  { frames: 2, when: 'a frame later' },
]) {
  test(`starts from its stop after an overlay takes focus back ${when}`, async ({
    page,
  }, testInfo) => {
    const target = testInfo.project.name as PreviewScriptedTarget;
    await gotoPreview(page, target);
    await mountStory(page, 'components-field', { value: 'hello' });
    await expect(page.locator('.FixtureFieldInput')).toBeVisible();
    await settle(page);
    for (let run = 0; run < 5; run += 1) {
      // As a menu open on load does: it closes when focus leaves it and hands
      // focus to its trigger, which Tab would otherwise start from, walking
      // off the end of the mount.
      await page.evaluate((frameCount) => {
        const input =
          document.querySelector<HTMLInputElement>('.FixtureFieldInput')!;
        const mark =
          document.querySelector<HTMLButtonElement>('.FixtureFieldMark')!;
        const handOff = (remaining: number) =>
          requestAnimationFrame(() =>
            remaining > 1 ? handOff(remaining - 1) : mark.focus()
          );
        input.focus();
        input.addEventListener('focusout', () => handOff(frameCount), {
          once: true,
        });
      }, frames);
      const walk = await walkKeyboard(page);
      expect(walk.failures, `run ${run + 1}`).toEqual([]);
    }
  });
}

test('gives up on a stop that a focus trap never gives focus back to', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await mountStory(page, 'components-field', { value: 'hello' });
  await expect(page.locator('.FixtureFieldInput')).toBeVisible();
  await settle(page);
  await countStartingStopFocus(page);
  // A focus trap on the input and button: focus that lands anywhere else is
  // pulled back to the input.
  await page.evaluate(() => {
    const input =
      document.querySelector<HTMLInputElement>('.FixtureFieldInput')!;
    const mark =
      document.querySelector<HTMLButtonElement>('.FixtureFieldMark')!;
    document.addEventListener('focusin', (event) => {
      if (event.target !== input && event.target !== mark) input.focus();
    });
  });
  const walk = await walkKeyboard(page);
  // Tab starts inside the trap, and the walk says so.
  expect(walk.forward[0]).toBe('button.FixtureFieldMark');
  expect(walk.failures).toHaveLength(2);
  // Once when the walk began, and twice put back.
  expect(await readStartingStopFocus(page)).toBe(3);
});

/** Mount the fixture field and wait for it, for a walk over content a test
 *  adds beside it. */
async function mountField(page: Page, target: PreviewScriptedTarget) {
  await gotoPreview(page, target);
  await mountStory(page, 'components-field', { value: 'hello' });
  await expect(page.locator('.FixtureFieldInput')).toBeVisible();
  await settle(page);
}

test('walks around a native modal dialog instead of the mount behind it', async ({
  page,
}, testInfo) => {
  await mountField(page, testInfo.project.name as PreviewScriptedTarget);
  await page.evaluate(() => {
    document
      .querySelector('.FixtureFieldMark')!
      .insertAdjacentHTML(
        'afterend',
        '<dialog class="Modal"><button class="First">a</button>' +
          '<input class="Second" /><button class="Third">c</button></dialog>'
      );
    document.querySelector<HTMLDialogElement>('.Modal')!.showModal();
  });
  const walk = await walkKeyboard(page);
  expect(walk.scope).toBe('modal');
  expect(walk.expected).toEqual([
    'button.First',
    'input.Second',
    'button.Third',
  ]);
  expect(walk.failures).toEqual([]);
  expect([...walk.forward].sort()).toEqual([...walk.expected].sort());
  expect([...walk.backward].sort()).toEqual([...walk.expected].sort());
  // The walk leaves nothing of its own behind.
  expect(
    await page
      .locator('[data-keyboard-walk-scope], [data-keyboard-walk]')
      .count()
  ).toBe(0);
});

test('walks around a modal on the body that wraps Tab itself', async ({
  page,
}, testInfo) => {
  await mountField(page, testInfo.project.name as PreviewScriptedTarget);
  await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div class="Sheet" role="dialog" aria-modal="true" aria-label="Sheet">' +
        '<button class="First">a</button><button class="Last">b</button></div>'
    );
    const first = document.querySelector<HTMLElement>('.First')!;
    const last = document.querySelector<HTMLElement>('.Last')!;
    document.querySelector('.Sheet')!.addEventListener('keydown', (event) => {
      const key = event as KeyboardEvent;
      if (key.key !== 'Tab') return;
      const edge = key.shiftKey ? first : last;
      if (document.activeElement !== edge) return;
      key.preventDefault();
      (key.shiftKey ? last : first).focus();
    });
    first.focus();
  });
  const walk = await walkKeyboard(page);
  expect(walk.scope).toBe('modal');
  // From the first button: on to the last and around; then back from there.
  expect(walk.forward).toEqual(['button.Last', 'button.First']);
  expect(walk.backward).toEqual(['button.First', 'button.Last']);
  expect(walk.failures).toEqual([]);
});

test('reports a modal that lets focus out to the page behind it', async ({
  page,
}, testInfo) => {
  await mountField(page, testInfo.project.name as PreviewScriptedTarget);
  await page.evaluate(() => {
    document
      .querySelector('.FixtureFieldMark')!
      .insertAdjacentHTML(
        'afterend',
        '<div class="Sheet" role="dialog" aria-modal="true" aria-label="Sheet">' +
          '<button class="First">a</button><button class="Last">b</button></div>'
      );
    document.querySelector<HTMLElement>('.First')!.focus();
  });
  const walk = await walkKeyboard(page);
  expect(walk.scope).toBe('modal');
  expect(walk.failures).toHaveLength(2);
  expect(walk.failures[0]).toContain('outside:input.FixtureFieldInput');
});

test('walks around a modal with nothing tabbable in it', async ({
  page,
}, testInfo) => {
  await mountField(page, testInfo.project.name as PreviewScriptedTarget);
  await page.evaluate(() => {
    document
      .querySelector('.FixtureFieldMark')!
      .insertAdjacentHTML(
        'afterend',
        '<dialog class="Modal"><p>Saved.</p></dialog>'
      );
    document.querySelector<HTMLDialogElement>('.Modal')!.showModal();
  });
  const walk = await walkKeyboard(page);
  expect(walk.scope).toBe('modal');
  expect(walk.expected).toEqual([]);
  expect(walk.failures).toEqual([]);
});

test('reports a composite widget whose items all take Tab, or that nothing reaches', async ({
  page,
}, testInfo) => {
  await mountField(page, testInfo.project.name as PreviewScriptedTarget);
  await page.evaluate(() => {
    document.querySelector('.FixtureFieldMark')!.insertAdjacentHTML(
      'afterend',
      // Every tab takes Tab.
      '<div id="tabs" role="tablist"><button role="tab">a</button>' +
        '<button role="tab">b</button><button role="tab" disabled>c</button></div>' +
        // No option takes Tab and nothing stands in for them.
        '<ul id="orphan" role="listbox"><li role="option" tabindex="-1">a</li>' +
        '<li role="option" tabindex="-1">b</li></ul>' +
        // Roving: one item takes Tab.
        '<div id="roving" role="tablist"><button role="tab">a</button>' +
        '<button role="tab" tabindex="-1">b</button></div>' +
        // The widget takes Tab and names its active item.
        '<ul id="active" role="listbox" tabindex="0" aria-activedescendant="one">' +
        '<li id="one" role="option">a</li><li role="option">b</li></ul>' +
        // A popup its trigger names.
        '<button id="trigger" aria-controls="popup">open</button>' +
        '<div id="popup" role="menu"><div role="menuitem" tabindex="-1">a</div></div>' +
        // Native radio buttons, which the browser groups.
        '<div id="native" role="radiogroup"><input type="radio" name="n" aria-label="a" />' +
        '<input type="radio" name="n" aria-label="b" /></div>' +
        // A single item is its widget's one stop.
        '<div id="single" role="tablist"><button role="tab">a</button></div>'
    );
  });
  const walk = await walkKeyboard(page);
  expect(walk.failures).toEqual([
    'tablist div#tabs: all 2 of its items take Tab; it is one tab stop, and the arrow keys move inside it',
    'listbox ul#orphan: none of its 2 items takes Tab, and neither does it, so the keyboard cannot reach it',
  ]);
});

test('leaves focus on its stop when nothing takes it', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await mountStory(page, 'components-field', { value: 'hello' });
  await expect(page.locator('.FixtureFieldInput')).toBeVisible();
  await settle(page);
  await countStartingStopFocus(page);
  const walk = await walkKeyboard(page);
  expect(walk.failures).toEqual([]);
  expect(await readStartingStopFocus(page)).toBe(1);
});

const FAULTY = 'components-faulty';

for (const { case: caseName, component, message } of [
  {
    case: 'throws in its first render',
    component: { id: FAULTY, name: 'Faulty' },
    message: /toUpperCase|undefined/,
  },
  {
    case: 'has a child component that throws',
    component: { id: 'components-faultyparent', name: 'FaultyParent' },
    message: /toUpperCase|undefined/,
  },
  {
    case: 'throws a value that is no Error',
    component: { id: 'components-faultyvalue', name: 'FaultyValue' },
    message: /thrown text/,
  },
]) {
  test(`fails a story that ${caseName}`, async ({ page }, testInfo) => {
    const target = testInfo.project.name as PreviewScriptedTarget;
    const result = await sweepPreview(page, [component], { target });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain(
      `${component.id} [default] render - the story threw as it rendered: `
    );
    expect(result.failures[0]).toMatch(message);
  });
}

test('fails a story that throws after a props update', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  // The story changes its props right after it mounts: label goes away.
  await page.addInitScript((id) => {
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'preview:set-story' && event.data.id === id) {
        setTimeout(() => {
          window.postMessage(
            { type: 'preview:props', props: { label: null } },
            '*'
          );
        }, 0);
      }
    });
  }, FAULTY);
  const result = await sweepPreview(
    page,
    [{ id: FAULTY, name: 'Faulty', defaultProps: { label: 'fine' } }],
    { target }
  );
  expect(result.failures).toHaveLength(1);
  expect(result.failures[0]).toContain(
    'render - the story threw as it rendered: '
  );
});

test('reads a throw from setProps on the mounted story, and clears it on the next mount', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await mountStory(page, FAULTY, { label: 'fine' });
  await expect(page.locator('.FixtureFaulty')).toHaveText('FINE');
  await settle(page);
  expect(await readRenderError(page)).toBeUndefined();
  await setProps(page, { label: null });
  await expect.poll(() => readRenderError(page)).not.toBeUndefined();
  await expect(walkKeyboard(page)).rejects.toThrow('threw as it rendered');
  await mountStory(page, FAULTY, { label: 'again' });
  await expect(page.locator('.FixtureFaulty')).toHaveText('AGAIN');
  await settle(page);
  expect(await readRenderError(page)).toBeUndefined();
});

test('recovers on the next state after one throws, and a known entry accepts it', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  const component = {
    id: FAULTY,
    name: 'Faulty',
    defaultProps: { label: 'fine' },
    scenarios: [
      { id: 'unlabeled', props: { label: null } },
      { id: 'labeled', props: { label: 'also fine' } },
    ],
  };
  const unaccepted = await sweepPreview(page, [component], { target });
  expect(unaccepted.failures).toHaveLength(1);
  expect(unaccepted.failures[0]).toContain('[unlabeled] render -');
  const accepted = await sweepPreview(page, [component], {
    target,
    known: [
      {
        rule: 'render',
        component: FAULTY,
        states: ['unlabeled'],
        reason: 'The fixture throws for want of a label.',
      },
    ],
  });
  expect(accepted.failures).toEqual([]);
  expect(accepted.stale).toEqual([]);
});

test('passes a story whose content merely reads like the error message', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  const result = await sweepPreview(
    page,
    [
      {
        id: 'components-probe',
        name: 'Probe',
        defaultProps: { label: 'render error: boom' },
      },
    ],
    { target }
  );
  expect(result.failures).toEqual([]);
});

test('a Vue application that could not mount leaves the next mount a clean page', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'vue',
    'a failure only the Vue pane reaches'
  );
  await gotoPreview(page, 'vue');
  // A DOM failure while mounting gets past Vue's error handling; this is the
  // first insertion since the page loaded, the story mounting into the empty pane.
  await page.evaluate(() => {
    const insert = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function refuse() {
      Node.prototype.insertBefore = insert;
      throw new Error('the DOM refused');
    };
  });
  await mountStory(page, FAULTY, { label: 'fine' });
  await expect.poll(() => readRenderError(page)).not.toBeUndefined();
  await mountStory(page, FAULTY, { label: 'fine' });
  await expect(page.locator('.FixtureFaulty')).toHaveText('FINE');
  expect(await readRenderError(page)).toBeUndefined();
});

test('ignores a late error from an application since replaced', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'vue',
    'the error handler of the Vue pane'
  );
  type HandlerWindow = Window & {
    previousHandler: (error: unknown) => void;
  };
  const handler = () =>
    (
      document.getElementById('app') as unknown as {
        __vue_app__: {
          config: { errorHandler: (error: unknown) => void };
        };
      }
    ).__vue_app__.config.errorHandler;
  await gotoPreview(page, 'vue');
  await mountStory(page, 'components-probe', { label: 'first' });
  await expect(page.locator('.FixtureProbe')).toHaveText('first');
  await page.evaluate(`window.previousHandler = (${handler})()`);
  await mountStory(page, 'components-probe', { label: 'next' });
  await expect(page.locator('.FixtureProbe')).toHaveText('next');
  await settle(page);
  await page.evaluate(() =>
    (window as unknown as HandlerWindow).previousHandler(new Error('late'))
  );
  await settle(page);
  expect(await readRenderError(page)).toBeUndefined();
  await expect(page.locator('.FixtureProbe')).toHaveText('next');
  // The current application's own error still reports.
  await page.evaluate(`(${handler})()(new Error('current'))`);
  await expect.poll(() => readRenderError(page)).toBe('current');
});

/** Record the page's uncaught errors and console errors from here on. */
function recordErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

// A hand-written fixture that reads its label before the markup updates, as
// a component driving a headless machine reads its props.
const EAGER = 'components-eager';

test('clears a mounted story without rendering it again short of its props', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  const errors = recordErrors(page);
  await gotoPreview(page, target);
  await mountStory(page, EAGER, { label: 'fine' });
  await expect(page.locator('.FixtureEager')).toHaveText('FINE');
  await settle(page);
  // The clearing step of mountStory on its own: the empty story, no props.
  await page.evaluate(() =>
    window.postMessage({ type: 'preview:set-story', id: '', props: {} }, '*')
  );
  await expect(page.locator('#app > *')).toHaveCount(0);
  await settle(page);
  // The Svelte pane used to set the empty props on the story still mounted,
  // which read its label gone as it unmounted and threw past the boundary,
  // and the error stopped the pane reporting the mounts that followed.
  expect(await readRenderError(page)).toBeUndefined();
  expect(errors).toEqual([]);
  await mountStory(page, EAGER, { label: 'again' });
  await waitForStory(page, EAGER);
  await expect(page.locator('.FixtureEager')).toHaveText('AGAIN');
  expect(errors).toEqual([]);
});

test('sweeps the states of a story that needs its props with no error between them', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  const errors = recordErrors(page);
  const result = await sweepPreview(
    page,
    [
      {
        id: EAGER,
        name: 'Eager',
        defaultProps: { label: 'one' },
        scenarios: [
          { id: 'two', props: { label: 'two' } },
          { id: 'three', props: { label: 'three' } },
        ],
      },
    ],
    { target }
  );
  expect(result.failures).toEqual([]);
  expect(result.empty).toEqual([]);
  expect(errors).toEqual([]);
});

const VACANT = 'components-vacant';

test('finishes and passes a state that renders nothing, in a default state and a scenario', async ({
  page,
}, testInfo) => {
  // A wait with nothing to wait for used to run to the test's own limit.
  test.setTimeout(30_000);
  const target = testInfo.project.name as PreviewScriptedTarget;
  const component = {
    id: VACANT,
    name: 'Vacant',
    scenarios: [
      { id: 'shown', label: 'Shown', props: { visible: true } },
      { id: 'dismissed', label: 'Dismissed', props: { visible: false } },
    ],
  };
  const result = await sweepPreview(page, [component], { target });
  expect(result.failures).toEqual([]);
  expect(result.stale).toEqual([]);
  expect(result.empty).toEqual([
    `${VACANT} [default] rendered nothing, so nothing was scanned or walked`,
    `${VACANT} [Dismissed (dismissed)] rendered nothing, so nothing was scanned or walked`,
  ]);
});

test('scans the state after one that rendered nothing, on a fresh mount', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  const shown = {
    id: VACANT,
    name: 'Vacant',
    scenarios: [{ id: 'shown', props: { visible: true } }],
  };
  // The accepted violation only occurs if the rendered state was scanned.
  const result = await sweepPreview(page, [shown], {
    target,
    known: [
      {
        rule: 'color-contrast',
        component: VACANT,
        states: ['shown'],
        reason: 'Stands in for any rule, to prove the state was scanned.',
      },
    ],
  });
  expect(result.empty).toHaveLength(1);
  expect(result.sweeps[0]!.passes).toEqual(['base']);
  // Either the rule held (the entry is stale) or it broke (it occurred); both
  // are answers from a scan of the rendered button.
  expect(result.failures).toEqual([]);
  expect(result.stale.length + result.sweeps[0]!.occurred.length).toBe(1);
});

// A kit's `mount` wrapper: the pane moves the mount into it, so the wrapper is
// a child of the body that is no part of any story.
const wrappedPort = process.env.TESTING_E2E_WRAPPED_PORT ?? '6231';
const wrappedBaseUrl = `http://localhost:${wrappedPort}`;
const WRAPPED_STATES = {
  id: VACANT,
  name: 'Vacant',
  scenarios: [
    { id: 'shown', label: 'Shown', props: { visible: true } },
    { id: 'worded', label: 'Worded', props: { worded: true } },
    { id: 'dismissed', label: 'Dismissed', props: { visible: false } },
  ],
};

test('lists a state that renders nothing inside a mount wrapper, and not one that renders', async ({
  page,
}, testInfo) => {
  test.setTimeout(30_000);
  const target = testInfo.project.name as PreviewScriptedTarget;
  const result = await sweepPreview(page, [WRAPPED_STATES], {
    target,
    baseUrl: wrappedBaseUrl,
  });
  // The story sits inside the frame, beside the frame's own element.
  await expect(
    page.locator('[data-fixture-preview-wrapper] .FixtureFrame__story > #app')
  ).toHaveCount(1);
  await expect(
    page.locator('[data-fixture-preview-wrapper] .FixtureFrame__chrome')
  ).toHaveCount(1);
  expect(result.failures).toEqual([]);
  // `Shown` holds an element and `Worded` text alone, so neither is listed.
  expect(result.empty).toEqual([
    `${VACANT} [default] rendered nothing, so nothing was scanned or walked`,
    `${VACANT} [Dismissed (dismissed)] rendered nothing, so nothing was scanned or walked`,
  ]);
});

test('reads a story that renders only on the body as rendered, inside a mount wrapper', async ({
  page,
}, testInfo) => {
  test.setTimeout(30_000);
  const target = testInfo.project.name as PreviewScriptedTarget;
  // Stands in for a portal: an element on the body for as long as the story
  // is mounted, the mount itself left empty.
  await page.addInitScript((storyId) => {
    window.addEventListener('message', (event) => {
      if (event.data?.type !== 'preview:set-story') return;
      document.getElementById('body-only')?.remove();
      if (event.data.id !== storyId) return;
      const element = document.createElement('div');
      element.id = 'body-only';
      element.textContent = 'On the body';
      document.body.appendChild(element);
    });
  }, VACANT);
  const result = await sweepPreview(page, [{ id: VACANT, name: 'Vacant' }], {
    target,
    baseUrl: wrappedBaseUrl,
  });
  expect(result.failures).toEqual([]);
  expect(result.empty).toEqual([]);
});

test('fails a story that throws inside a mount wrapper, and does not list it', async ({
  page,
}, testInfo) => {
  test.setTimeout(30_000);
  const target = testInfo.project.name as PreviewScriptedTarget;
  const faulty = { id: 'components-faulty', name: 'Faulty' };
  const result = await sweepPreview(page, [faulty], {
    target,
    baseUrl: wrappedBaseUrl,
  });
  expect(result.failures).toHaveLength(1);
  expect(result.failures[0]).toContain(
    `${faulty.id} [default] render - the story threw as it rendered: `
  );
  expect(result.empty).toEqual([]);
});

test('fails a story the page never finishes mounting, naming it and the state', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  // The pane's report that it mounted a story never lands.
  await page.addInitScript(() => {
    Object.defineProperty(window, '__previewMountedStory', {
      get: () => '',
      set: () => {},
    });
  });
  const started = Date.now();
  await expect(
    sweepPreview(page, [{ id: VACANT, name: 'Vacant' }], { target })
  ).rejects.toThrow(
    new RegExp(
      `${VACANT} \\[default\\] in ${target}: waitForStory: .*'${VACANT}'.*never finished mounting`
    )
  );
  expect(Date.now() - started).toBeLessThan(25_000);
});

test('reports only the render failure when a story throws during the walk', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  const id = 'components-faultycontrol';
  // Focus reaching the control takes its label away: it throws on the update.
  await page.addInitScript(() => {
    document.addEventListener('focusin', (event) => {
      if ((event.target as Element).matches('.FixtureFaultyControl')) {
        window.postMessage(
          { type: 'preview:props', props: { label: null } },
          '*'
        );
      }
    });
  });
  const result = await sweepPreview(
    page,
    [{ id, name: 'FaultyControl', defaultProps: { label: 'fine' } }],
    { target }
  );
  expect(result.failures).toHaveLength(1);
  expect(result.failures[0]).toContain(
    `${id} [default] render - the story threw as it rendered: `
  );
});

test('rejects a pass value the option does not list, and accepts one it does', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await expect(setOptions(page, { mode: 'midnight' })).rejects.toThrow(
    `option 'mode' has no value "midnight". Its values: light, dark.`
  );
  await expect(setOptions(page, { motion: 'on' })).rejects.toThrow(
    `option 'motion' takes true or false, not "on".`
  );
  await setOptions(page, { mode: 'dark', motion: false });
});

test('throws from a scan whose tag no axe rule carries', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await mountStory(page, 'components-button');
  await settle(page);
  await expect(
    scanAccessibility(page, { tags: ['wcag2aa-misspelled'] })
  ).rejects.toThrow('no axe rule carries wcag2aa-misspelled');
});

test('throws from a scan with a tag no axe rule carries beside one that does', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await mountStory(page, 'components-button');
  await settle(page);
  await expect(
    scanAccessibility(page, { tags: ['wcag2a', 'wcag2-a'] })
  ).rejects.toThrow('no axe rule carries wcag2-a');
  await expect(
    scanAccessibility(page, {
      tags: ['wcag2a', 'wcag22aa', 'best-practice', 'cat.color', 'ACT'],
    })
  ).resolves.toBeDefined();
});

test('throws from a walk on a page with nothing mounted', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await gotoPreview(page, target);
  await expect(walkKeyboard(page)).rejects.toThrow('holds no elements');
});

test('a page whose modules fail to load fails within seconds, named', async ({
  page,
}, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  await page.route(/\/application\/preview\/|main\.ts/, (route) =>
    route.abort()
  );
  const started = Date.now();
  await expect(gotoPreview(page, target)).rejects.toThrow(
    /the preview page at \/preview\/\w+\/preview\.html never announced itself: look for a page error/
  );
  expect(Date.now() - started).toBeLessThan(25_000);
});
