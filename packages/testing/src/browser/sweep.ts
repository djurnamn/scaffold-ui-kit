// A sweep over a kit's preview: every component, in its default props and
// each scenario, scanned with axe and walked with the keyboard in one target.

import {
  gotoPreview,
  mountStory,
  PREVIEW_MOUNT_ELEMENT_ID,
  readRenderError,
  readStoryIds,
  setOptions,
  settle,
  waitForStory,
  type PreviewManifestComponent,
  type PreviewOptionValues,
  type PreviewScriptedTarget,
} from '@scaffold-ui-kit/preview/testing';

import { formatViolation, scanAccessibility, type ScanOptions } from './axe.js';
import { walkKeyboard, type KeyboardPage } from './keyboard.js';

/** One state of a component a sweep mounts. */
export interface SweepState {
  /** `default` for the default props, or the scenario's id. */
  id: string;
  /** The scenario's label, or `default`. */
  label: string;
  /** The props it mounts with: the defaults, the scenario's over them, less
   *  those unset with `null`, as the preview's panes mount them. */
  props: Record<string, unknown>;
  /** The id of the story it mounts, for a scenario with slot content of its
   *  own, which is a story beside the component's. Absent when it mounts
   *  the component's story. */
  story?: string;
}

/** The state id of a component's default props. */
export const DEFAULT_STATE = 'default';

/**
 * The states a sweep mounts for a component: its default props, then each
 * scenario's props laid over them, a scenario with slot content of its own
 * as the story that holds it. A prop given `null` is left out, as every
 * pane leaves it, so the component's own default applies; a two-way prop
 * stays, controlled at `null`.
 *
 * @param component - The component.
 * @returns Its states, in order.
 */
export function sweepStates(component: PreviewManifestComponent): SweepState[] {
  const defaults = component.defaultProps ?? {};
  const twoWay = new Set(
    (component.bindings ?? []).map((binding) => binding.prop)
  );
  const mounted = (props: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(props).filter(
        ([name, value]) => value !== null || twoWay.has(name)
      )
    );
  return [
    { id: DEFAULT_STATE, label: DEFAULT_STATE, props: mounted(defaults) },
    ...(component.scenarios ?? []).map((scenario) => {
      const props = { ...defaults, ...(scenario.props ?? {}) };
      // The placeholder text a component with no content starts from is the
      // preview's own; a scenario that fills the default slot replaces it.
      if (
        scenario.content?.default !== undefined &&
        component.previewDefaults?.children !== undefined &&
        !('children' in (scenario.props ?? {}))
      ) {
        delete props.children;
      }
      return {
        id: scenario.id,
        label: scenario.label ?? scenario.id,
        props: mounted(props),
        ...(scenario.story === undefined ? {} : { story: scenario.story }),
      };
    }),
  ];
}

/** Whether a sweep covers a component in a target: one with a story of its
 *  own that renders in the target. */
export function sweepsComponent(
  component: PreviewManifestComponent,
  target: PreviewScriptedTarget
): boolean {
  return (
    component.standalone !== false &&
    (!component.targets || component.targets.includes(target))
  );
}

/** The rule name a keyboard walk's failure is known by. */
export const KEYBOARD_RULE = 'keyboard';

/** The rule name a render failure is known by: a story that threw as it
 *  rendered. */
export const RENDER_RULE = 'render';

/** The label of a sweep's first pass, under the preview's default option
 *  values; the keyboard walk runs in it alone. */
export const BASE_PASS = 'base';

/** A violation a kit accepts, with the reason. */
export interface KnownViolation {
  /** The axe rule's id, {@link KEYBOARD_RULE} for a keyboard walk, or
   *  {@link RENDER_RULE} for a story that throws. */
  rule: string;
  /** The component's story id. */
  component: string;
  /** The ids of the states it occurs in: {@link DEFAULT_STATE} or scenario
   *  ids. It must occur in each. */
  states: string[];
  /** The targets it occurs in; every target when absent. */
  targets?: PreviewScriptedTarget[];
  /** The passes it occurs in, by label ({@link BASE_PASS} for the first);
   *  every pass when absent. Listed, it must occur in each, and a listed
   *  pass the sweep does not run is reported as stale; absent, in at least
   *  one. */
  passes?: string[];
  /** Why it is accepted, and what fixes it. */
  reason: string;
}

/** A further pass over every state, under preview option values. Each pass
 *  starts from a freshly loaded page, so its option values are its own and
 *  never add to another pass's. */
export interface SweepPass {
  /** The pass's name in a failure, such as `dark`. */
  label: string;
  /** The option values it applies, such as `{ mode: 'dark' }`. */
  options: PreviewOptionValues;
  /** The axe rules it runs; the scan's tags when absent. */
  rules?: string[];
}

/** How a sweep runs. */
export interface SweepOptions {
  /** The target whose preview page to load. */
  target: PreviewScriptedTarget;
  /** The violations the kit accepts. */
  known?: KnownViolation[];
  /** The axe rule tags; WCAG 2.1 A and AA by default. */
  tags?: ScanOptions['tags'];
  /** Further axe passes under option values, after the first pass. */
  passes?: SweepPass[];
  /** Walk each state with the keyboard (the default) or not. */
  keyboard?: boolean;
  /** Where the preview is served, when not at the test runner's base URL. */
  baseUrl?: string;
}

/** A known violation that occurred in a sweep. */
export interface OccurredViolation {
  /** The rule, as {@link KnownViolation.rule} names it. */
  rule: string;
  /** The component's story id. */
  component: string;
  /** The id of the state it occurred in. */
  state: string;
  /** The target it occurred in. */
  target: PreviewScriptedTarget;
  /** The label of the pass it occurred in, {@link BASE_PASS} for the first. */
  pass: string;
}

/** What a sweep found in one component. */
export interface ComponentSweep {
  /** The component's story id. */
  component: string;
  /** Violations no known entry accepts, one line each. */
  failures: string[];
  /** The known violations that occurred, one record per rule, state and
   *  pass. Plain data, so a sweep can be written to JSON and given to
   *  {@link staleViolations} when read back. */
  occurred: OccurredViolation[];
  /** The labels of the passes it ran, {@link BASE_PASS} first. */
  passes: string[];
  /** The states that rendered nothing, one line each: nothing was scanned or
   *  walked in them. A state that renders nothing is a state like any other,
   *  so these are not failures. */
  empty: string[];
}

/** A violation as one line of a report. */
function violationLine(violation: OccurredViolation): string {
  const { rule, component, state, target, pass } = violation;
  return `${rule} @ ${component} › ${state} (${target} · ${pass})`;
}

/** Whether two records are the same violation. */
function isSameViolation(
  first: OccurredViolation,
  second: OccurredViolation
): boolean {
  return (
    first.rule === second.rule &&
    first.component === second.component &&
    first.state === second.state &&
    first.target === second.target &&
    first.pass === second.pass
  );
}

function isKnown(
  known: KnownViolation[],
  violation: OccurredViolation
): boolean {
  return known.some(
    (entry) =>
      entry.rule === violation.rule &&
      entry.component === violation.component &&
      entry.states.includes(violation.state) &&
      (!entry.targets || entry.targets.includes(violation.target)) &&
      (!entry.passes || entry.passes.includes(violation.pass))
  );
}

/**
 * Stop on a known entry that has no `states` list or names its states under
 * `scenarios`: shapes the type rejects, which a spec that is not type-checked
 * would still pass.
 *
 * @param known - The violations the kit accepts.
 * @throws When an entry has a `scenarios` key or no `states` array, the
 *   message naming `states`.
 */
function assertKnownViolations(known: KnownViolation[]): void {
  for (const entry of known) {
    if ('scenarios' in entry) {
      throw new Error(
        `The known violation ${entry.rule} @ ${entry.component} uses the key 'scenarios'; list the states it occurs in under 'states' instead.`
      );
    }
    if (!Array.isArray(entry.states)) {
      throw new Error(
        `The known violation ${entry.rule} @ ${entry.component} has no 'states' list; list the states it occurs in under 'states'.`
      );
    }
  }
}

/** The body elements that are never a story's content. */
const NON_CONTENT_TAGS = ['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT'];

/** Whether a mounted story rendered anything: in the mount, or on the body
 *  beside it, as a toast region does. A child of the body that holds the
 *  mount is the mount itself or the kit's `mount` wrapper, which the pane
 *  moves the mount into, and so never the story's. Runs in the browser. */
function rendered(argument: {
  mountId: string;
  nonContentTags: string[];
}): boolean {
  const mount = document.getElementById(argument.mountId);
  if (!mount) return false;
  return (
    mount.childElementCount > 0 ||
    (mount.textContent ?? '').trim() !== '' ||
    [...document.body.children].some(
      (element) =>
        !element.contains(mount) &&
        !argument.nonContentTags.includes(element.tagName)
    )
  );
}

/** Whether the mount holds an element. Runs in the browser. */
function holdsElements(mountId: string): boolean {
  return (document.getElementById(mountId)?.childElementCount ?? 0) > 0;
}

/**
 * Sweep one component in one target: load the target's preview page, then
 * mount each state fresh (the default props, then every scenario), scan the
 * page with axe and walk the mount with the keyboard. Each further pass
 * loads the page again, applies its own option values to the defaults and
 * scans every state again, so no pass inherits another's values. A state
 * whose story throws as it renders fails under {@link RENDER_RULE}, with the
 * checks skipped, as there is nothing of it to check. A state that renders
 * nothing is not a failure: it is reported in `empty`, unscanned and unwalked.
 * A violation a known entry accepts is recorded rather than failed.
 *
 * @param page - A Playwright page.
 * @param component - The component, from the preview manifest.
 * @param options - The target, the known violations and the passes.
 * @returns The failures and the known violations that occurred.
 * @throws When the component has no story of its own, or does not render in
 *   the target, the message naming the targets it does, when a state never
 *   finishes mounting, the message naming the state, or when a known entry
 *   has a `scenarios` key, the message naming `states`.
 * @example
 * ```ts
 * const sweep = await sweepComponent(page, component, { target: 'vue', known: KNOWN });
 * expect(sweep.failures).toEqual([]);
 * ```
 */
export async function sweepComponent(
  page: KeyboardPage,
  component: PreviewManifestComponent,
  options: SweepOptions
): Promise<ComponentSweep> {
  const { target, known = [], keyboard = true } = options;
  assertKnownViolations(known);
  if (component.standalone === false) {
    throw new Error(
      `${component.id} has no story of its own; it renders inside its root, so a sweep of it would check nothing.`
    );
  }
  if (component.targets && !component.targets.includes(target)) {
    throw new Error(
      `${component.id} does not render in target '${target}', so a sweep there would check nothing. It renders in: ${component.targets.join(', ') || 'no target'}.`
    );
  }
  const states = sweepStates(component);
  const failures: string[] = [];
  const empty: string[] = [];
  const occurred: OccurredViolation[] = [];
  // A known entry names the state by id, which a generated scenario's label
  // does not show.
  const stateName = (state: SweepState, pass: string) => {
    const name =
      state.id === state.label ? state.label : `${state.label} (${state.id})`;
    return `[${pass === BASE_PASS ? name : `${name} · ${pass}`}]`;
  };
  const record = (
    rule: string,
    state: SweepState,
    line: string,
    pass: string
  ) => {
    const violation: OccurredViolation = {
      rule,
      component: component.id,
      state: state.id,
      target,
      pass,
    };
    if (isKnown(known, violation)) {
      // A walk reports each step that went wrong; the record is the rule's.
      if (!occurred.some((seen) => isSameViolation(seen, violation))) {
        occurred.push(violation);
      }
    } else {
      failures.push(`${stateName(state, pass)} ${line}`);
    }
  };

  const passes: (SweepPass | undefined)[] = [
    undefined,
    ...(options.passes ?? []),
  ];
  for (const pass of passes) {
    const passLabel = pass?.label ?? BASE_PASS;
    await gotoPreview(page, target, { baseUrl: options.baseUrl });
    if (pass) await setOptions(page, pass.options);
    for (const state of states) {
      const story = state.story ?? component.id;
      await mountStory(page, story, state.props);
      await waitForStory(page, story).catch((error: Error) => {
        throw new Error(
          `${component.id} [${state.id}] in ${target}: ${error.message}`
        );
      });
      await settle(page);
      let thrown = await readRenderError(page);
      if (
        thrown === undefined &&
        !(await page.evaluate(rendered, {
          mountId: PREVIEW_MOUNT_ELEMENT_ID,
          nonContentTags: NON_CONTENT_TAGS,
        }))
      ) {
        empty.push(
          `${stateName(state, passLabel)} rendered nothing, so nothing was scanned or walked`
        );
        continue;
      }
      if (thrown === undefined) {
        const violations = await scanAccessibility(page, {
          rules: pass?.rules,
          tags: options.tags,
        });
        for (const violation of violations) {
          record(violation.id, state, formatViolation(violation), passLabel);
        }
        // A story that renders only on the body, such as a toast region,
        // leaves the walk nothing to walk.
        if (
          keyboard &&
          !pass &&
          (await readRenderError(page)) === undefined &&
          (await page.evaluate(holdsElements, PREVIEW_MOUNT_ELEMENT_ID))
        ) {
          const walk = await walkKeyboard(page);
          // A story that threw while it was walked has lost its elements, so
          // what the walk says of them is the throw again.
          if ((await readRenderError(page)) === undefined) {
            for (const failure of walk.failures) {
              record(
                KEYBOARD_RULE,
                state,
                `${KEYBOARD_RULE} - ${failure}`,
                BASE_PASS
              );
            }
          }
        }
        thrown = await readRenderError(page);
      }
      if (thrown !== undefined) {
        record(
          RENDER_RULE,
          state,
          `${RENDER_RULE} - the story threw as it rendered: ${thrown || '(no message)'}`,
          passLabel
        );
      }
    }
  }
  return {
    component: component.id,
    failures,
    occurred,
    passes: passes.map((pass) => pass?.label ?? BASE_PASS),
    empty,
  };
}

/**
 * The known violations that did not occur in a sweep, one line each. Only
 * the entries for the target and for components the sweep covered are
 * judged, so a sweep over part of a kit judges that part. An entry that
 * lists passes must occur in each of them, and a listed pass no sweep ran is
 * reported; one that lists none must occur in at least one pass.
 *
 * @param known - The violations the kit accepts.
 * @param sweeps - What the sweep found in each component.
 * @param target - The target swept.
 * @returns A line per entry and state that no longer occurs.
 * @throws When a known entry has a `scenarios` key, the message naming
 *   `states`.
 */
export function staleViolations(
  known: KnownViolation[],
  sweeps: ComponentSweep[],
  target: PreviewScriptedTarget
): string[] {
  assertKnownViolations(known);
  const swept = new Map(sweeps.map((sweep) => [sweep.component, sweep]));
  const occurred = sweeps.flatMap((sweep) => sweep.occurred);
  return known
    .filter(
      (entry) =>
        swept.has(entry.component) &&
        (!entry.targets || entry.targets.includes(target))
    )
    .flatMap((entry) => {
      const ran = swept.get(entry.component)?.passes ?? [BASE_PASS];
      const violation = (state: string, pass: string): OccurredViolation => ({
        rule: entry.rule,
        component: entry.component,
        state,
        target,
        pass,
      });
      const hasOccurred = (state: string, pass: string) =>
        occurred.some((seen) => isSameViolation(seen, violation(state, pass)));
      const neverRan = (entry.passes ?? [])
        .filter((pass) => !ran.includes(pass))
        .map(
          (pass) =>
            `${entry.rule} @ ${entry.component} (${target}) names the pass '${pass}', which no sweep ran (it ran: ${ran.join(', ')})`
        );
      return entry.states
        .flatMap((state) => {
          if (!entry.passes) {
            return ran.some((pass) => hasOccurred(state, pass))
              ? []
              : [
                  `${violationLine(violation(state, ran.join(', ')))} no longer occurs`,
                ];
          }
          return entry.passes
            .filter((pass) => ran.includes(pass) && !hasOccurred(state, pass))
            .map(
              (pass) =>
                `${violationLine(violation(state, pass))} no longer occurs`
            );
        })
        .concat(neverRan)
        .map(
          (line) =>
            `${line}; remove it from the known violations (${entry.reason})`
        );
    });
}

/**
 * The known violations whose component a sweep could never reach: one with
 * no story on the preview page, whether a misspelled id or a part. Components
 * the sweep was not given, but that have a story, are left alone, so a sweep
 * over part of a kit judges that part.
 *
 * @param known - The violations the kit accepts.
 * @param components - The components the sweep was given.
 * @param storyIds - The ids of the stories the preview page can mount.
 * @param target - The target swept.
 * @returns A line per entry that names no component.
 */
function unreachableViolations(
  known: KnownViolation[],
  components: PreviewManifestComponent[],
  storyIds: string[],
  target: PreviewScriptedTarget
): string[] {
  const given = new Set(
    components
      .filter((component) => component.standalone !== false)
      .map((component) => component.id)
  );
  return known
    .filter(
      (entry) =>
        (!entry.targets || entry.targets.includes(target)) &&
        !given.has(entry.component) &&
        !storyIds.includes(entry.component)
    )
    .map(
      (entry) =>
        `${entry.rule} @ ${entry.component} (${target}): this preview has no story with that id; remove it from the known violations (${entry.reason})`
    );
}

/** What {@link sweepPreview} found. */
export interface PreviewSweep {
  /** What it found in each component. */
  sweeps: ComponentSweep[];
  /** Every component's failures, each line prefixed with the component. */
  failures: string[];
  /** Every component's states that rendered nothing, as
   *  {@link ComponentSweep.empty}, each line prefixed with the component. */
  empty: string[];
  /** The known violations that no longer occur. */
  stale: string[];
}

/**
 * Sweep components in one target, each with {@link sweepComponent}, skipping
 * those that have no story of their own or do not render in the target, and
 * judge the known violations once all have run.
 *
 * @param page - A Playwright page.
 * @param components - The components, such as {@link readPreviewManifest} returns.
 * @param options - The target, the known violations and the passes.
 * @returns Each component's sweep, every failure and the stale known entries.
 * @throws When no component is swept in the target, the message naming the
 *   targets the components render in, or when a known entry has a `scenarios`
 *   key, the message naming `states`.
 * @example
 * ```ts
 * test('accessibility', async ({ page }, testInfo) => {
 *   const target = testInfo.project.name as PreviewScriptedTarget;
 *   const result = await sweepPreview(page, readPreviewManifest(kitRoot), { target, known: KNOWN });
 *   expect(result.failures).toEqual([]);
 *   expect(result.stale).toEqual([]);
 * });
 * ```
 */
export async function sweepPreview(
  page: KeyboardPage,
  components: PreviewManifestComponent[],
  options: SweepOptions
): Promise<PreviewSweep> {
  assertKnownViolations(options.known ?? []);
  const covered = components.filter((component) =>
    sweepsComponent(component, options.target)
  );
  if (covered.length === 0) {
    const targets = [
      ...new Set(components.flatMap((component) => component.targets ?? [])),
    ];
    throw new Error(
      `A sweep in target '${options.target}' would check nothing: none of the ${components.length} components given has a story of its own there. They render in: ${targets.join(', ') || 'no target listed'}.`
    );
  }
  const sweeps: ComponentSweep[] = [];
  for (const component of covered) {
    sweeps.push(await sweepComponent(page, component, options));
  }
  return {
    sweeps,
    failures: sweeps.flatMap((sweep) =>
      sweep.failures.map((failure) => `${sweep.component} ${failure}`)
    ),
    empty: sweeps.flatMap((sweep) =>
      sweep.empty.map((line) => `${sweep.component} ${line}`)
    ),
    stale: [
      ...staleViolations(options.known ?? [], sweeps, options.target),
      ...unreachableViolations(
        options.known ?? [],
        components,
        await readStoryIds(page),
        options.target
      ),
    ],
  };
}
