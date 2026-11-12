// Where the controller keeps what a person chose: the host page's query
// parameters, which make a link a deep link into the preview, and, when the
// kit asks for it, the browser's local storage, which remembers the global
// option values across sessions. Everything read back is checked against the
// catalog and the options, so a stale or hand-edited value is ignored.
// Browser-safe: no node imports.

import type { PreviewPropType } from '../lib/types.js';
import { stableStringify } from './editor-tree.js';
import {
  acceptsOptionValue,
  type OptionValue,
  type PreviewOption,
} from '../options.js';
import type { PreviewTarget } from '../protocol.js';

/** The host page's query parameters the controller reads and writes. */
export const URL_PARAMETER = {
  /** The selected component story's id. */
  component: 'component',
  /** The selected custom view's id. */
  view: 'view',
  /** The selected scenario's id. */
  scenario: 'scenario',
  /** The story's root props that differ from its scenario's, as JSON. */
  props: 'props',
  /** The visible targets, comma-separated, when not every one is visible. */
  targets: 'targets',
  /** The width the story panes are laid out at, in CSS pixels, when they
   *  are not fitted to the space the shell gives them. */
  width: 'width',
  /** The prefix of an option's parameter: `option.<id>=<value>`. */
  optionPrefix: 'option.',
} as const;

/** The part of the Web Storage interface the controller uses. */
export type PreviewStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

/** What the query parameters say, before it is checked against the catalog. */
export interface UrlState {
  component?: string;
  view?: string;
  scenario?: string;
  /** The root props as written: JSON, unparsed. */
  props?: string;
  /** The visible targets as written: a comma-separated list. */
  targets?: string;
  /** The story panes' width as written. */
  width?: string;
  /** Option values as written, keyed by option id. */
  options: Record<string, string>;
}

/** What the controller writes to the query parameters. */
export interface UrlStateToWrite {
  selection: { kind: 'component' | 'view'; id: string };
  /** The scenario, when it is not the story's default. */
  scenario?: string;
  /** The root props that differ from the scenario's, a prop of the
   *  scenario's the story leaves out set to `null`. */
  props?: Record<string, unknown>;
  /** The visible targets, `html` among them, when not every one of the
   *  kit's is visible. */
  targets?: readonly PreviewTarget[];
  /** The story panes' width in CSS pixels, when they are not fitted. */
  width?: number;
  /** The option values to keep, keyed by option id. */
  options: Record<string, OptionValue>;
}

/**
 * Read the controller's parameters from a query string.
 *
 * @param search - The query string, with or without its leading `?`.
 * @returns The parameters, unchecked.
 */
export function readUrlState(search: string): UrlState {
  const parameters = new URLSearchParams(search);
  const options: Record<string, string> = {};
  for (const [key, value] of parameters) {
    if (key.startsWith(URL_PARAMETER.optionPrefix))
      options[key.slice(URL_PARAMETER.optionPrefix.length)] = value;
  }
  const value = (key: string) => parameters.get(key) ?? undefined;
  return {
    component: value(URL_PARAMETER.component),
    view: value(URL_PARAMETER.view),
    scenario: value(URL_PARAMETER.scenario),
    props: value(URL_PARAMETER.props),
    targets: value(URL_PARAMETER.targets),
    width: value(URL_PARAMETER.width),
    options,
  };
}

/**
 * An option's value as written in a query parameter or storage: `true` or
 * `false` for a boolean, one of its values for a choice.
 *
 * @param option - The option.
 * @param raw - The value as written.
 * @returns The value, or `undefined` when the option cannot hold it.
 */
export function parseOptionValue(
  option: Pick<PreviewOption, 'values'>,
  raw: unknown
): OptionValue | undefined {
  if (option.values === undefined) {
    if (raw === 'true' || raw === true) return true;
    if (raw === 'false' || raw === false) return false;
    return undefined;
  }
  return acceptsOptionValue(option, raw) ? raw : undefined;
}

/**
 * The visible targets a query parameter names, among the kit's, `html`
 * included where the kit builds it. An empty parameter names none; one that
 * names none of the kit's is ignored.
 *
 * @param raw - The parameter as written: a comma-separated list.
 * @param targets - The kit's targets (`PreviewCatalog.targets`).
 * @returns The targets in the kit's order, or `undefined` when the
 *   parameter is to be ignored.
 */
export function parseTargets(
  raw: string,
  targets: readonly PreviewTarget[]
): PreviewTarget[] | undefined {
  const named = raw.split(',').map((name) => name.trim());
  const known = targets.filter((target) => named.includes(target));
  if (raw.trim() === '') return [];
  return known.length > 0 ? known : undefined;
}

/** The widest a story pane is laid out at, in CSS pixels: an 8K screen's width. */
export const MAXIMUM_PANE_WIDTH = 7680;

/**
 * Whether `value` can be a story pane's width: a whole number of CSS pixels,
 * from 1 to `MAXIMUM_PANE_WIDTH`.
 *
 * @param value - The candidate width.
 * @returns Whether it is one.
 */
export function isPaneWidth(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAXIMUM_PANE_WIDTH
  );
}

/**
 * The story panes' width a query parameter names: a whole number of CSS
 * pixels, from 1 to `MAXIMUM_PANE_WIDTH`.
 *
 * @param raw - The parameter as written, such as `768`.
 * @returns The width, or `undefined` when the parameter is to be ignored.
 */
export function parsePaneWidth(raw: string): number | undefined {
  if (!/^\d+$/.test(raw.trim())) return undefined;
  const width = Number(raw.trim());
  return isPaneWidth(width) ? width : undefined;
}

/**
 * Whether a prop's control can hold `value`: a boolean for a toggle, a
 * finite number for a number input, one of its values for a select, one of
 * the color tokens for a color select, and a string or a number for a text
 * input.
 *
 * @param propType - The prop.
 * @param value - The candidate value.
 * @param colorTokens - The color tokens a color select offers.
 * @returns Whether the prop accepts the value.
 */
export function acceptsPropValue(
  propType: Pick<PreviewPropType, 'control' | 'options'>,
  value: unknown,
  colorTokens: readonly (string | null)[]
): boolean {
  switch (propType.control) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'select':
      return (
        (typeof value === 'string' || typeof value === 'boolean') &&
        (propType.options ?? []).includes(value)
      );
    case 'color-select':
      return typeof value === 'string' && colorTokens.includes(value);
    case 'text':
      return (
        typeof value === 'string' ||
        (typeof value === 'number' && Number.isFinite(value))
      );
  }
}

/**
 * The props that differ from `base`, as the address holds them: each prop
 * whose value differs, and each prop of `base` the props leave out, as
 * `null`, so a link opens on what renders. {@link parseProps} reads them
 * back over the same `base`.
 *
 * @param props - The props the story renders with.
 * @param base - The props the story starts from: its scenario's.
 * @param marksMissing - Whether a prop of `base` the props leave out is
 *   written as `null`.
 * @returns The props that differ, in their order, then those left out.
 * @example
 * ```ts
 * changedProps({ selected: 'b', items }, { selected: 'a', items, icon: 'plus' }, () => true);
 * // { selected: 'b', icon: null }
 * ```
 */
export function changedProps(
  props: Record<string, unknown>,
  base: Record<string, unknown>,
  marksMissing: (name: string) => boolean
): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(props))
    if (
      value !== undefined &&
      stableStringify(value) !== stableStringify(base[name])
    )
      changed[name] = value;
  for (const [name, value] of Object.entries(base))
    if (value !== undefined && props[name] === undefined && marksMissing(name))
      changed[name] = null;
  return changed;
}

/**
 * The root props a query parameter gives, checked against the component's
 * props. The parameter holds the props that differ from the scenario's: a
 * prop it leaves out takes its value in `defaults`, the scenario's props, as
 * a freshly picked scenario does, and a prop it sets to `null` is left out
 * of the result, unless `fallback` holds `null` for it, which keeps the
 * `null`.
 * Only props the component declares, with a value its control
 * accepts, are kept; a declared prop whose value is refused keeps its value
 * in `fallback`, the scenario's props, or else its default. A parameter that
 * is not a JSON object is ignored.
 *
 * @param raw - The parameter as written.
 * @param propTypes - The component's props.
 * @param defaults - The props a prop left out keeps: the scenario's.
 * @param fallback - The scenario's props, for a refused value.
 * @param colorTokens - The color tokens a color select offers.
 * @returns The props, or `undefined` when the parameter is to be ignored.
 * @example
 * ```ts
 * parseProps('{"variant":"ghost","icon":null}', propTypes, { size: 'md', icon: 'plus' }, {}, []);
 * // { size: 'md', variant: 'ghost' }
 * ```
 */
export function parseProps(
  raw: string,
  propTypes: readonly Pick<PreviewPropType, 'name' | 'control' | 'options'>[],
  defaults: Record<string, unknown>,
  fallback: Record<string, unknown>,
  colorTokens: readonly (string | null)[]
): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return undefined;
  const props: Record<string, unknown> = { ...defaults };
  for (const [name, value] of Object.entries(parsed)) {
    const propType = propTypes.find((candidate) => candidate.name === name);
    if (!propType) continue;
    if (value === null) {
      if (fallback[name] === null) props[name] = null;
      else delete props[name];
    } else if (acceptsPropValue(propType, value, colorTokens))
      props[name] = value;
    else if (fallback[name] !== undefined) props[name] = fallback[name];
  }
  return props;
}

/**
 * Write the controller's parameters into a query string, keeping every
 * parameter that is not the controller's.
 *
 * @param search - The current query string.
 * @param state - What to write.
 * @returns The new query string, without its leading `?`.
 */
export function writeUrlState(search: string, state: UrlStateToWrite): string {
  const parameters = new URLSearchParams(search);
  for (const key of [...parameters.keys()]) {
    if (
      key === URL_PARAMETER.component ||
      key === URL_PARAMETER.view ||
      key === URL_PARAMETER.scenario ||
      key === URL_PARAMETER.props ||
      key === URL_PARAMETER.targets ||
      key === URL_PARAMETER.width ||
      key.startsWith(URL_PARAMETER.optionPrefix)
    ) {
      parameters.delete(key);
    }
  }
  parameters.set(
    state.selection.kind === 'view'
      ? URL_PARAMETER.view
      : URL_PARAMETER.component,
    state.selection.id
  );
  if (state.scenario !== undefined)
    parameters.set(URL_PARAMETER.scenario, state.scenario);
  if (state.props !== undefined)
    parameters.set(URL_PARAMETER.props, JSON.stringify(state.props));
  if (state.targets !== undefined)
    parameters.set(URL_PARAMETER.targets, state.targets.join(','));
  if (state.width !== undefined)
    parameters.set(URL_PARAMETER.width, String(state.width));
  for (const [id, value] of Object.entries(state.options)) {
    parameters.set(`${URL_PARAMETER.optionPrefix}${id}`, String(value));
  }
  // A comma and a colon need no escaping in a query string: left as they
  // are, a list of targets and a story's props stay readable.
  return parameters.toString().replace(/%2C/gi, ',').replace(/%3A/gi, ':');
}

/**
 * The local-storage key a kit's remembered option values live under.
 *
 * @param kitName - The kit's name.
 * @returns The key.
 */
export function storageKey(kitName: string): string {
  return `scaffold-ui-kit-preview:${kitName}:options`;
}

/**
 * The option values remembered under `key`, those the options can still
 * hold. Storage that cannot be read, or holds something else, gives none.
 *
 * @param storage - The storage.
 * @param key - The key.
 * @param options - The options the values may belong to.
 * @returns The values, keyed by option id.
 */
export function readStoredOptions(
  storage: PreviewStorage,
  key: string,
  options: Array<Pick<PreviewOption, 'id' | 'values'>>
): Record<string, OptionValue> {
  let stored: unknown;
  try {
    const text = storage.getItem(key);
    stored = text === null ? undefined : JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored))
    return {};
  const values: Record<string, OptionValue> = {};
  for (const option of options) {
    const value = parseOptionValue(
      option,
      (stored as Record<string, unknown>)[option.id]
    );
    if (value !== undefined) values[option.id] = value;
  }
  return values;
}

/**
 * Remember option values under `key`; with none, forget them. A storage that
 * refuses the write (private browsing, a full or blocked store) is ignored.
 *
 * @param storage - The storage.
 * @param key - The key.
 * @param values - The values to remember, keyed by option id.
 */
export function writeStoredOptions(
  storage: PreviewStorage,
  key: string,
  values: Record<string, OptionValue>
): void {
  try {
    if (Object.keys(values).length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(values));
  } catch {
    // Nothing to do: the values simply are not remembered.
  }
}
