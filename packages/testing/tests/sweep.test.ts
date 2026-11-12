import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PreviewScriptedTarget } from '@scaffold-ui-kit/preview/testing';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  BASE_PASS,
  DEFAULT_STATE,
  KEYBOARD_RULE,
  RENDER_RULE,
  formatViolation,
  readPreviewManifest,
  scanAccessibility,
  staleViolations,
  sweepComponent,
  sweepPreview,
  sweepStates,
  sweepsComponent,
  walkKeyboard,
  type AxeViolation,
  type ComponentSweep,
  type KeyboardPage,
  type KnownViolation,
  type OccurredViolation,
  type PreviewManifestComponent,
} from '../src/browser/index.js';

// What the scan finds, per mounted story id and props, set by each test.
let violationsFor: (
  props: Record<string, unknown>,
  options: Record<string, unknown>
) => AxeViolation[] = () => [];
let scanRanNothing = false;
// What a story throws, per mounted props: undefined when it renders.
let renderErrorFor: (
  props: Record<string, unknown>
) => string | undefined = () => undefined;
// Whether the mount holds elements, for the keyboard walk.
let mountHoldsElements = false;
// Whether the mounted story rendered anything.
let storyRendered = true;
let mountedProps: Record<string, unknown> = {};
// The option values the page holds since it was last loaded.
let pageOptions: Record<string, unknown> = {};

// The tags the fake axe's rules carry; `undefined` for every tag asked for.
let carriedTags: string[] | undefined;

vi.mock('@axe-core/playwright', () => ({
  default: class {
    tags: string[] = [];
    withTags(tags: string[]) {
      this.tags = tags;
      return this;
    }
    withRules() {
      return this;
    }
    async analyze() {
      return {
        violations: violationsFor(mountedProps, pageOptions),
        passes: [],
        incomplete: [],
        inapplicable: scanRanNothing
          ? []
          : [{ id: 'accesskeys', tags: carriedTags ?? this.tags }],
      };
    }
  },
}));

/** A page that records the messages the preview helpers post and answers
 *  every wait at once. */
function fakePage(): KeyboardPage & { visits: string[]; options: unknown[] } {
  const visits: string[] = [];
  const options: unknown[] = [];
  return {
    visits,
    options,
    keyboard: { press: async () => {} },
    async goto(url: string) {
      visits.push(url);
      pageOptions = {};
    },
    async waitForFunction() {},
    async evaluate<Result, Argument>(
      _: (argument: Argument) => Result | Promise<Result>,
      argument: Argument
    ): Promise<Result> {
      if (argument === '__previewStories') {
        return ['components-button', 'components-dot'] as Result;
      }
      if (argument === '__previewOptions') {
        return [
          { id: 'mode', values: ['light', 'dark'] },
          { id: 'density', values: ['tight', 'loose', 'compact'] },
        ] as Result;
      }
      if (argument === '__previewRenderError') {
        return renderErrorFor(mountedProps) as Result;
      }
      if (argument === 'app') return mountHoldsElements as Result;
      if (
        typeof argument === 'object' &&
        argument !== null &&
        'nonContentTags' in argument
      ) {
        return storyRendered as Result;
      }
      const message = argument as {
        type?: string;
        props?: Record<string, unknown>;
        values?: unknown;
      };
      if (message?.type === 'preview:set-story' && message.props) {
        mountedProps = message.props;
      } else if (message && typeof message === 'object' && 'type' in message) {
        options.push(message);
        const given = (message as { options?: Record<string, unknown> })
          .options;
        pageOptions = { ...pageOptions, ...given };
      }
      return undefined as Result;
    },
  };
}

const button: PreviewManifestComponent = {
  id: 'components-button',
  name: 'Button',
  defaultProps: { label: 'Save', tone: 'calm' },
  scenarios: [
    { id: 'icon-only', label: 'Icon only', props: { label: '' } },
    { id: 'loud', props: { tone: 'loud' } },
  ],
};

const nameless: AxeViolation = {
  id: 'button-name',
  impact: 'critical',
  help: 'Buttons must have discernible text',
  nodes: [{ target: ['#app', 'button'] }],
};

describe('sweepStates', () => {
  it('lists the default props, then each scenario over them', () => {
    expect(sweepStates(button)).toEqual([
      {
        id: DEFAULT_STATE,
        label: 'default',
        props: { label: 'Save', tone: 'calm' },
      },
      {
        id: 'icon-only',
        label: 'Icon only',
        props: { label: '', tone: 'calm' },
      },
      { id: 'loud', label: 'loud', props: { label: 'Save', tone: 'loud' } },
    ]);
  });

  it("mounts a scenario with slot content of its own as the story that holds it, without the preview's placeholder text", () => {
    const states = sweepStates({
      id: 'components-notice',
      name: 'Notice',
      defaultProps: { children: 'Notice', tone: 'calm' },
      previewDefaults: { children: 'Notice' },
      scenarios: [
        {
          id: 'failed',
          props: { tone: 'loud' },
          content: { default: { kind: 'text', value: 'Failed.' } },
          story: 'components-notice--failed',
        },
        {
          id: 'with-action',
          content: { named: { action: { kind: 'text', value: 'Undo' } } },
          story: 'components-notice--with-action',
        },
        { id: 'loud', props: { tone: 'loud' } },
      ],
    });
    expect(states).toEqual([
      {
        id: DEFAULT_STATE,
        label: 'default',
        props: { children: 'Notice', tone: 'calm' },
      },
      {
        id: 'failed',
        label: 'failed',
        props: { tone: 'loud' },
        story: 'components-notice--failed',
      },
      {
        id: 'with-action',
        label: 'with-action',
        props: { children: 'Notice', tone: 'calm' },
        story: 'components-notice--with-action',
      },
      {
        id: 'loud',
        label: 'loud',
        props: { children: 'Notice', tone: 'loud' },
      },
    ]);
  });

  it('leaves a prop given null out, as the panes do', () => {
    const states = sweepStates({
      id: 'a',
      name: 'A',
      defaultProps: { title: 'Hello', icon: null },
      scenarios: [{ id: 'untitled', props: { title: null, tone: 'loud' } }],
    });
    expect(states.map((state) => state.props)).toEqual([
      { title: 'Hello' },
      { tone: 'loud' },
    ]);
  });

  it('keeps a two-way prop given null, controlled at null', () => {
    const states = sweepStates({
      id: 'a',
      name: 'A',
      bindings: [{ prop: 'value' }],
      defaultProps: { defaultValue: 'x' },
      scenarios: [{ id: 'cleared', props: { value: null, label: null } }],
    });
    expect(states[1]!.props).toEqual({ defaultValue: 'x', value: null });
  });

  it('reads a component with no props or scenarios as one state', () => {
    expect(sweepStates({ id: 'a', name: 'A' })).toEqual([
      { id: DEFAULT_STATE, label: 'default', props: {} },
    ]);
  });
});

describe('a sweep that would check nothing', () => {
  it('throws from sweepPreview for a target no component renders in, naming the targets', async () => {
    const page = fakePage();
    await expect(
      sweepPreview(
        page,
        [
          { ...button, targets: ['react', 'vue'] },
          { ...button, id: 'components-dot', targets: ['vue', 'svelte'] },
        ],
        { target: 'html' as PreviewScriptedTarget }
      )
    ).rejects.toThrow(
      "A sweep in target 'html' would check nothing: none of the 2 components given has a story of its own there. They render in: react, vue, svelte."
    );
    expect(page.visits).toEqual([]);
  });

  it('throws from sweepPreview when only parts are given, or nothing', async () => {
    await expect(
      sweepPreview(fakePage(), [{ ...button, standalone: false }], {
        target: 'vue',
      })
    ).rejects.toThrow('would check nothing');
    await expect(
      sweepPreview(fakePage(), [], { target: 'vue' })
    ).rejects.toThrow('none of the 0 components');
  });

  it('throws from sweepComponent for a target the component does not list', async () => {
    const page = fakePage();
    await expect(
      sweepComponent(
        page,
        { ...button, targets: ['react', 'vue'] },
        { target: 'svelte' }
      )
    ).rejects.toThrow(
      "components-button does not render in target 'svelte', so a sweep there would check nothing. It renders in: react, vue."
    );
    expect(page.visits).toEqual([]);
  });

  it('throws for a pass naming an option the preview does not define', async () => {
    await expect(
      sweepComponent(fakePage(), button, {
        target: 'vue',
        keyboard: false,
        passes: [{ label: 'dark', options: { colorScheme: 'dark' } }],
      })
    ).rejects.toThrow(
      "setOptions: this preview defines no option 'colorScheme'. Its options: mode, density."
    );
  });

  it('throws for a component whose story the preview does not have', async () => {
    await expect(
      sweepComponent(
        fakePage(),
        { id: 'components-gone', name: 'Gone' },
        { target: 'vue', keyboard: false }
      )
    ).rejects.toThrow("no story with the id 'components-gone'");
  });
});

describe('sweepsComponent', () => {
  it('skips a component with no story of its own, or one the target does not render', () => {
    expect(sweepsComponent(button, 'vue')).toBe(true);
    expect(sweepsComponent({ ...button, standalone: false }, 'vue')).toBe(
      false
    );
    expect(sweepsComponent({ ...button, targets: ['react'] }, 'vue')).toBe(
      false
    );
    expect(sweepsComponent({ ...button, targets: ['react'] }, 'react')).toBe(
      true
    );
  });
});

describe('formatViolation', () => {
  it('writes the rule, impact, help and first element', () => {
    expect(formatViolation(nameless)).toBe(
      'button-name (critical) - Buttons must have discernible text → #app button'
    );
    expect(formatViolation({ ...nameless, impact: null, nodes: [] })).toBe(
      'button-name (unrated) - Buttons must have discernible text → (no element)'
    );
  });
});

describe('sweepComponent', () => {
  const known: KnownViolation[] = [
    {
      rule: 'button-name',
      component: 'components-button',
      states: ['icon-only'],
      reason:
        'An icon-only button takes its name from a label the story leaves out.',
    },
  ];

  it('mounts every state in the target and records a known violation', async () => {
    violationsFor = (props) => (props.label === '' ? [nameless] : []);
    const page = fakePage();
    const sweep = await sweepComponent(page, button, {
      target: 'svelte',
      known,
      keyboard: false,
    });
    expect(page.visits).toEqual(['/preview/svelte/preview.html']);
    expect(sweep).toEqual({
      component: 'components-button',
      empty: [],
      failures: [],
      occurred: [
        {
          rule: 'button-name',
          component: 'components-button',
          state: 'icon-only',
          target: 'svelte',
          pass: BASE_PASS,
        },
      ],
      passes: [BASE_PASS],
    });
  });

  it('records a violation once, however many times a state breaks the rule', async () => {
    violationsFor = (props) => (props.label === '' ? [nameless, nameless] : []);
    const sweep = await sweepComponent(fakePage(), button, {
      target: 'svelte',
      known,
      keyboard: false,
    });
    expect(sweep.occurred).toHaveLength(1);
  });

  it('fails a violation no entry accepts, naming the state and pass', async () => {
    violationsFor = (props) => (props.tone === 'loud' ? [nameless] : []);
    const sweep = await sweepComponent(fakePage(), button, {
      target: 'react',
      known,
      keyboard: false,
      passes: [
        { label: 'dark', options: { mode: 'dark' }, rules: ['color-contrast'] },
      ],
    });
    expect(sweep.failures).toEqual([
      `[loud] ${formatViolation(nameless)}`,
      `[loud · dark] ${formatViolation(nameless)}`,
    ]);
  });

  it('accepts an entry in its own passes only', async () => {
    violationsFor = (props) => (props.label === '' ? [nameless] : []);
    const sweep = await sweepComponent(fakePage(), button, {
      target: 'react',
      known: [{ ...known[0]!, passes: ['dark'] }],
      keyboard: false,
      passes: [{ label: 'dark', options: { mode: 'dark' } }],
    });
    expect(sweep.failures).toEqual([
      `[Icon only (icon-only)] ${formatViolation(nameless)}`,
    ]);
    expect(sweep.occurred).toEqual([
      {
        rule: 'button-name',
        component: 'components-button',
        state: 'icon-only',
        target: 'react',
        pass: 'dark',
      },
    ]);
    expect(sweep.passes).toEqual([BASE_PASS, 'dark']);
  });

  it('runs each pass on a freshly loaded page, under its own option values', async () => {
    const seen: Record<string, unknown>[] = [];
    violationsFor = (_, options) => {
      seen.push({ ...options });
      return [];
    };
    const page = fakePage();
    await sweepComponent(
      page,
      { id: 'components-dot', name: 'Dot' },
      {
        target: 'vue',
        keyboard: false,
        passes: [
          { label: 'dark', options: { mode: 'dark' } },
          { label: 'dense', options: { density: 'compact' } },
        ],
      }
    );
    expect(page.visits).toHaveLength(3);
    expect(seen).toEqual([{}, { mode: 'dark' }, { density: 'compact' }]);
  });

  it('accepts an entry for its own targets only', async () => {
    violationsFor = (props) => (props.label === '' ? [nameless] : []);
    const sweep = await sweepComponent(fakePage(), button, {
      target: 'vue',
      known: [{ ...known[0]!, targets: ['react'] }],
      keyboard: false,
    });
    expect(sweep.failures).toHaveLength(1);
    expect(sweep.occurred).toEqual([]);
  });
});

describe('a story that throws', () => {
  beforeEach(() => {
    renderErrorFor = () => undefined;
    violationsFor = () => [];
    mountedProps = {};
    mountHoldsElements = false;
    scanRanNothing = false;
  });

  it('fails the state under the render rule and sweeps the rest', async () => {
    const scanned: unknown[] = [];
    renderErrorFor = (props) => (props.label === '' ? 'boom' : undefined);
    violationsFor = (props) => {
      scanned.push(props.label);
      return [];
    };
    const sweep = await sweepComponent(fakePage(), button, { target: 'vue' });
    expect(sweep.failures).toEqual([
      '[Icon only (icon-only)] render - the story threw as it rendered: boom',
    ]);
    // Neither check ran on the state that threw, and the next state still ran.
    expect(scanned).toEqual(['Save', 'Save']);
  });

  it('fails a throw with an empty message', async () => {
    renderErrorFor = () => '';
    const sweep = await sweepComponent(
      fakePage(),
      { ...button, scenarios: [] },
      { target: 'vue' }
    );
    expect(sweep.failures).toEqual([
      '[default] render - the story threw as it rendered: (no message)',
    ]);
  });

  it('fails a throw that lands after the scan began', async () => {
    let scans = 0;
    violationsFor = () => {
      scans += 1;
      return [];
    };
    renderErrorFor = () => (scans > 0 ? 'late' : undefined);
    const sweep = await sweepComponent(
      fakePage(),
      { ...button, scenarios: [] },
      { target: 'vue' }
    );
    expect(sweep.failures).toEqual([
      '[default] render - the story threw as it rendered: late',
    ]);
  });

  it('lets a known entry name it, and reports the entry stale once it renders', async () => {
    renderErrorFor = () => 'boom';
    const known: KnownViolation[] = [
      {
        rule: RENDER_RULE,
        component: 'components-button',
        states: ['default', 'icon-only', 'loud'],
        reason: 'A reason.',
      },
    ];
    const throwing = await sweepPreview(fakePage(), [button], {
      target: 'vue',
      known,
    });
    expect(throwing.failures).toEqual([]);
    expect(throwing.stale).toEqual([]);
    renderErrorFor = () => undefined;
    const rendering = await sweepPreview(fakePage(), [button], {
      target: 'vue',
      known,
    });
    expect(rendering.stale).toHaveLength(3);
  });

  it('skips the walk for a story that renders only outside the mount', async () => {
    // The walk would throw on an empty mount; the fake's evaluate answers the
    // sweep's own check, so reaching the walk here would throw too.
    const sweep = await sweepComponent(
      fakePage(),
      { ...button, scenarios: [] },
      { target: 'vue' }
    );
    expect(sweep.failures).toEqual([]);
  });
});

describe('a state that renders nothing', () => {
  beforeEach(() => {
    renderErrorFor = () => undefined;
    violationsFor = () => [];
    mountedProps = {};
    mountHoldsElements = false;
    scanRanNothing = false;
    storyRendered = false;
  });
  afterEach(() => {
    storyRendered = true;
  });

  it('passes it, scans nothing and names it', async () => {
    const scanned: unknown[] = [];
    violationsFor = (props) => {
      scanned.push(props.label);
      return [nameless];
    };
    const sweep = await sweepComponent(fakePage(), button, { target: 'vue' });
    expect(sweep.failures).toEqual([]);
    expect(sweep.empty).toEqual([
      '[default] rendered nothing, so nothing was scanned or walked',
      '[Icon only (icon-only)] rendered nothing, so nothing was scanned or walked',
      '[loud] rendered nothing, so nothing was scanned or walked',
    ]);
    expect(scanned).toEqual([]);
  });

  it('names the pass it came up in, and prefixes the component in a preview sweep', async () => {
    const result = await sweepPreview(
      fakePage(),
      [{ ...button, scenarios: [] }],
      {
        target: 'vue',
        passes: [{ label: 'dark', options: { mode: 'dark' } }],
      }
    );
    expect(result.empty).toEqual([
      'components-button [default] rendered nothing, so nothing was scanned or walked',
      'components-button [default · dark] rendered nothing, so nothing was scanned or walked',
    ]);
  });

  it('leaves a state that threw to the render rule', async () => {
    renderErrorFor = () => 'boom';
    const sweep = await sweepComponent(
      fakePage(),
      { ...button, scenarios: [] },
      { target: 'vue' }
    );
    expect(sweep.empty).toEqual([]);
    expect(sweep.failures).toHaveLength(1);
  });

  it('reports a known entry for an empty state as stale', async () => {
    const result = await sweepPreview(
      fakePage(),
      [{ ...button, scenarios: [] }],
      {
        target: 'vue',
        known: [
          {
            rule: 'button-name',
            component: 'components-button',
            states: ['default'],
            reason: 'A reason.',
          },
        ],
      }
    );
    expect(result.stale).toHaveLength(1);
  });
});

describe('a check with nothing to check', () => {
  beforeEach(() => {
    scanRanNothing = false;
  });

  it('throws from a scan whose tag no axe rule carries, naming the tags', async () => {
    scanRanNothing = true;
    await expect(
      scanAccessibility(fakePage(), { tags: ['wcag2aaa-typo'] })
    ).rejects.toThrow('no axe rule carries wcag2aaa-typo');
    scanRanNothing = false;
  });

  it('throws for a tag no rule carries beside one that a rule does, naming only it', async () => {
    carriedTags = ['wcag2a'];
    await expect(
      scanAccessibility(fakePage(), { tags: ['wcag2a', 'wcag2-a'] })
    ).rejects.toThrow('no axe rule carries wcag2-a, so');
    carriedTags = undefined;
  });

  it('accepts every tag a rule carries', async () => {
    carriedTags = ['wcag2a', 'best-practice', 'cat.color'];
    await expect(
      scanAccessibility(fakePage(), { tags: ['best-practice', 'cat.color'] })
    ).resolves.toEqual([]);
    carriedTags = undefined;
  });

  it('throws for an empty list of tags or rules, in plain words', async () => {
    await expect(scanAccessibility(fakePage(), { tags: [] })).rejects.toThrow(
      'scanAccessibility: the list of tags is empty, so the scan would check nothing.'
    );
    await expect(scanAccessibility(fakePage(), { rules: [] })).rejects.toThrow(
      'scanAccessibility: the list of rules is empty, so the scan would check nothing.'
    );
  });

  it('throws from a walk over an empty mount', async () => {
    const page = fakePage();
    page.evaluate = (async () => 0) as KeyboardPage['evaluate'];
    await expect(walkKeyboard(page)).rejects.toThrow(
      'the element #app holds no elements, so a walk would check nothing. Mount a story first, or pass the `mountId`'
    );
  });

  it('throws from a walk over a mount that does not exist, naming it', async () => {
    const page = fakePage();
    page.evaluate = (async () => undefined) as KeyboardPage['evaluate'];
    await expect(walkKeyboard(page, { mountId: 'missing' })).rejects.toThrow(
      'walkKeyboard: no element has the id missing'
    );
  });

  it('throws from a walk over a story that threw', async () => {
    const page = fakePage();
    page.evaluate = (async (_: unknown, argument: unknown) =>
      argument === '__previewRenderError'
        ? 'boom'
        : 1) as KeyboardPage['evaluate'];
    await expect(walkKeyboard(page)).rejects.toThrow(
      'the mounted story threw as it rendered, so a walk would check nothing: boom'
    );
  });

  it('throws from sweepComponent for a part, which has no story', async () => {
    await expect(
      sweepComponent(
        fakePage(),
        { ...button, standalone: false },
        { target: 'vue' }
      )
    ).rejects.toThrow('components-button has no story of its own');
  });

  it('checks a pass option value through setOptions', async () => {
    await expect(
      sweepComponent(fakePage(), button, {
        target: 'vue',
        passes: [{ label: 'x', options: { mode: 'midnight' } }],
      })
    ).rejects.toThrow(`option 'mode' has no value "midnight"`);
  });
});

describe('known entries a sweep can never judge', () => {
  const dead: KnownViolation = {
    rule: 'label',
    component: 'components-alrt',
    states: ['default'],
    reason: 'A reason.',
  };

  it('reports an entry naming a component with no story', async () => {
    const result = await sweepPreview(fakePage(), [button], {
      target: 'vue',
      known: [dead],
    });
    expect(result.stale).toEqual([
      'label @ components-alrt (vue): this preview has no story with that id; remove it from the known violations (A reason.)',
    ]);
  });

  it('leaves an entry for a component the sweep was not given', async () => {
    const result = await sweepPreview(fakePage(), [button], {
      target: 'vue',
      known: [{ ...dead, component: 'components-dot' }],
    });
    expect(result.stale).toEqual([]);
  });

  it('leaves an entry for a given component that does not render in the target', async () => {
    const result = await sweepPreview(
      fakePage(),
      [button, { ...button, id: 'components-vue-only', targets: ['vue'] }],
      {
        target: 'react',
        known: [{ ...dead, component: 'components-vue-only' }],
      }
    );
    expect(result.stale).toEqual([]);
  });

  it('reports an entry naming a part', async () => {
    const result = await sweepPreview(
      fakePage(),
      [button, { ...button, id: 'components-part', standalone: false }],
      { target: 'vue', known: [{ ...dead, component: 'components-part' }] }
    );
    expect(result.stale).toHaveLength(1);
  });

  it('reports a listed pass no sweep ran', async () => {
    const result = await sweepPreview(fakePage(), [button], {
      target: 'vue',
      known: [
        {
          rule: 'label',
          component: 'components-button',
          states: ['default'],
          passes: ['drak'],
          reason: 'A reason.',
        },
      ],
    });
    expect(
      result.stale.some((line) => line.includes("names the pass 'drak'"))
    ).toBe(true);
  });
});

describe('a known entry under the key scenarios', () => {
  const old: KnownViolation = {
    rule: 'button-name',
    component: 'components-button',
    // @ts-expect-error `scenarios` is not a key of a known violation.
    scenarios: ['default'],
    reason: 'A reason.',
  };
  const message =
    "The known violation button-name @ components-button uses the key 'scenarios'; list the states it occurs in under 'states' instead.";

  it('throws from staleViolations, naming states', () => {
    expect(() => staleViolations([old], [], 'vue')).toThrow(message);
  });

  it('throws from sweepComponent before loading a page', async () => {
    const page = fakePage();
    await expect(
      sweepComponent(page, button, { target: 'vue', known: [old] })
    ).rejects.toThrow(message);
    expect(page.visits).toEqual([]);
  });

  it('throws from sweepPreview before loading a page', async () => {
    const page = fakePage();
    await expect(
      sweepPreview(page, [button], { target: 'vue', known: [old] })
    ).rejects.toThrow(message);
    expect(page.visits).toEqual([]);
  });

  it('throws when the entry carries states as well', () => {
    expect(() =>
      staleViolations([{ ...old, states: ['default'] }], [], 'vue')
    ).toThrow(message);
  });
});

describe('a known entry without a states list', () => {
  const typo = {
    rule: 'button-name',
    component: 'components-button',
    state: ['default'],
    reason: 'A reason.',
  } as unknown as KnownViolation;
  const message =
    "The known violation button-name @ components-button has no 'states' list; list the states it occurs in under 'states'.";

  it('throws from staleViolations', () => {
    expect(() => staleViolations([typo], [], 'vue')).toThrow(message);
  });

  it('throws from sweepComponent before loading a page', async () => {
    const page = fakePage();
    await expect(
      sweepComponent(page, button, { target: 'vue', known: [typo] })
    ).rejects.toThrow(message);
    expect(page.visits).toEqual([]);
  });

  it('throws from sweepPreview before loading a page', async () => {
    const page = fakePage();
    await expect(
      sweepPreview(page, [button], { target: 'vue', known: [typo] })
    ).rejects.toThrow(message);
    expect(page.visits).toEqual([]);
  });

  it('throws on states that is not an array', () => {
    expect(() =>
      staleViolations(
        [{ ...typo, states: 'default' as unknown as string[] }],
        [],
        'vue'
      )
    ).toThrow(message);
  });
});

describe('staleViolations', () => {
  const entry: KnownViolation = {
    rule: KEYBOARD_RULE,
    component: 'components-button',
    states: ['default', 'loud'],
    reason: 'A reason.',
  };

  it('reports each state of an entry that did not occur', () => {
    const sweeps = [
      {
        component: 'components-button',
        failures: [],
        occurred: [
          {
            rule: KEYBOARD_RULE,
            component: 'components-button',
            state: 'default',
            target: 'vue' as const,
            pass: BASE_PASS,
          },
        ],
        passes: [BASE_PASS],
        empty: [],
      },
    ];
    expect(staleViolations([entry], sweeps, 'vue')).toEqual([
      'keyboard @ components-button › loud (vue · base) no longer occurs; remove it from the known violations (A reason.)',
    ]);
  });

  it('wants an entry with no passes in one pass, and one with passes in each', () => {
    const dark: KnownViolation = {
      ...entry,
      rule: 'color-contrast',
      states: ['default'],
    };
    const sweeps = [
      {
        component: 'components-button',
        failures: [],
        occurred: [
          {
            rule: 'color-contrast',
            component: 'components-button',
            state: 'default',
            target: 'vue' as const,
            pass: 'dark',
          },
        ],
        passes: [BASE_PASS, 'dark', 'dense'],
        empty: [],
      },
    ];
    expect(staleViolations([dark], sweeps, 'vue')).toEqual([]);
    expect(
      staleViolations([{ ...dark, passes: ['dark'] }], sweeps, 'vue')
    ).toEqual([]);
    expect(
      staleViolations(
        [{ ...dark, passes: ['dark', 'dense', 'unrun'] }],
        sweeps,
        'vue'
      )
    ).toEqual([
      'color-contrast @ components-button › default (vue · dense) no longer occurs; remove it from the known violations (A reason.)',
      `color-contrast @ components-button (vue) names the pass 'unrun', which no sweep ran (it ran: base, dark, dense); remove it from the known violations (A reason.)`,
    ]);
  });

  const occurrence: OccurredViolation = {
    rule: KEYBOARD_RULE,
    component: 'components-button',
    state: 'default',
    target: 'vue',
    pass: BASE_PASS,
  };
  const sweepOf = (occurred: OccurredViolation[]): ComponentSweep[] => [
    {
      component: 'components-button',
      failures: [],
      occurred,
      passes: [BASE_PASS],
      empty: [],
    },
  ];
  const single: KnownViolation = { ...entry, states: ['default'] };

  it('judges a sweep read back from JSON, as a kit recording per test does', () => {
    const sweeps = JSON.parse(
      JSON.stringify(sweepOf([occurrence]))
    ) as ComponentSweep[];
    expect(staleViolations([single], sweeps, 'vue')).toEqual([]);
  });

  it.each([
    ['rule', { rule: 'label' }],
    ['component', { component: 'components-dot' }],
    ['state', { state: 'loud' }],
    ['target', { target: 'react' as const }],
    ['pass', { pass: 'dark' }],
  ])('does not take an occurrence of another %s for the entry', (_, other) => {
    expect(
      staleViolations([single], sweepOf([{ ...occurrence, ...other }]), 'vue')
    ).toHaveLength(1);
  });

  it('judges only the components swept and the entries for the target', () => {
    expect(staleViolations([entry], [], 'vue')).toEqual([]);
    const sweeps = [
      {
        component: 'components-button',
        failures: [],
        occurred: [],
        passes: [BASE_PASS],
        empty: [],
      },
    ];
    expect(
      staleViolations([{ ...entry, targets: ['react'] }], sweeps, 'vue')
    ).toEqual([]);
  });
});

describe('sweepPreview', () => {
  it('sweeps the components the target renders and judges the known entries', async () => {
    violationsFor = () => [];
    const result = await sweepPreview(
      fakePage(),
      [button, { ...button, id: 'components-dot', standalone: false }],
      {
        target: 'react',
        keyboard: false,
        known: [
          {
            rule: 'label',
            component: 'components-button',
            states: ['default'],
            reason: 'Fixed since.',
          },
        ],
      }
    );
    expect(result.sweeps.map((sweep) => sweep.component)).toEqual([
      'components-button',
    ]);
    expect(result.failures).toEqual([]);
    expect(result.stale).toHaveLength(1);
  });
});

describe('readPreviewManifest', () => {
  const kitRoot = mkdtempSync(join(tmpdir(), 'testing-manifest-'));
  afterAll(() => rmSync(kitRoot, { recursive: true, force: true }));

  it("reads the components of a kit's preview manifest", () => {
    mkdirSync(join(kitRoot, '.preview-generated'));
    writeFileSync(
      join(kitRoot, '.preview-generated', 'manifest.json'),
      JSON.stringify({ kitName: 'kit', components: [button] })
    );
    expect(readPreviewManifest(kitRoot)).toEqual([button]);
  });
});
