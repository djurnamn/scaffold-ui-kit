// The composable preview-options contract: the preview block's `options`,
// `canvas`, `mount` and `viewCanvas`, and the derived helpers the host +
// iframes share. Browser-safe - no node imports; both the Vite app and the
// kit's configuration type against this file.

import type {
  PreviewPaneWidth,
  PreviewThemeConfiguration,
} from './lib/types.js';

/** An option's runtime value: a string (a choice) or a boolean. */
export type OptionValue = string | boolean;

/** One value a choice option offers. */
export interface OptionChoice {
  value: string;
  label: string;
}

/** What kind of value an option holds: one of its `values`, or a boolean. */
export type OptionKind = 'choice' | 'boolean';

/** The group of the kit's own settings, such as its theme: what sets up the
 *  kit as a whole rather than the setting a component is shown in. */
export const KIT_OPTION_GROUP = 'kit';

/** The group of the options that set what a component is shown in, such as a
 *  color mode, a surface or the padding around it. An option without a group
 *  belongs to it. */
export const CONTEXT_OPTION_GROUP = 'context';

/** The prefix of a shell option's id in the preview's state, address and
 *  storage: a shell's `mode` is `shell.mode`, so it cannot collide with a kit
 *  option of the same name. */
export const SHELL_OPTION_PREFIX = 'shell.';

/** Which element an apply targets. `'root'` is the preview `<html>` (the
 *  default), `'body'` is `<body>`, and `{ ref }` is a named node in the
 *  kit's `mount` wrapper (resolved against the ref map). */
export type ApplyTarget = 'root' | 'body' | { ref: string };

/** How an option affects the preview canvas. The union is open by design - a
 *  new strategy slots in without touching the registry. `root-attribute` /
 *  `class` / `css-var` may carry a `target` to hit a `mount` wrapper
 *  node instead of the document root. */
export type OptionApply =
  /** Set `<attribute>="<value>"` on the target element (default the preview
   *  `<html>`); `false` or an empty value removes it. With `omitAtDefault`,
   *  the option's default value removes it too, for a kit whose default
   *  renders with no attribute, such as a default color mode. */
  | {
      type: 'root-attribute';
      attribute: string;
      target?: ApplyTarget;
      omitAtDefault?: boolean;
    }
  /** Swap the active theme stylesheet by value (`themes/<id>/theme.css`
   *  under the URL the preview is served from). */
  | { type: 'stylesheet' }
  /** Toggle `className` on the target by the value's truth; without
   *  `className`, set the value as the target's `data-<namePrefix>-preview-class`
   *  attribute for the kit's CSS to key off, `false` or an empty value removing
   *  it. `on` names `'root'` or `'body'`; `target` names either as well, or
   *  a wrapper node, and wins where both are given. */
  | {
      type: 'class';
      on?: 'root' | 'body';
      className?: string;
      target?: ApplyTarget;
    }
  /** Set a CSS custom property to the value on the target element; `false` or
   *  an empty value removes it. */
  | { type: 'css-var'; var: string; target?: ApplyTarget };

/**
 * One preview option: what it means, never where or how it is shown. Its kind
 * follows from its fields - an option with `values` is a choice among them
 * with a string `default`, and one without is a boolean with a boolean
 * `default` - and the preview's interface picks the widget for that kind.
 */
export interface PreviewOption {
  /** Stable key - the message payload key and the manifest per-story override key. */
  id: string;
  /** The option's name, as its control is labeled. */
  label: string;
  /** A longer description, such as a control's tooltip; markdown allowed. */
  title?: string;
  /** The values of a choice option. Omitted, the option is a boolean. */
  values?: OptionChoice[];
  /** The starting value: one of `values` for a choice, a boolean otherwise. */
  default: OptionValue;
  /** A free-form hint for where the option belongs: `'context'` (the
   *  default) for the setting a component is shown in, such as its color
   *  mode or the padding around it; `'kit'` for the kit's own settings, such
   *  as its theme; or a name of the kit's choosing for a set that belongs
   *  together, such as canvas settings. An interface places a group it does
   *  not know in a default place. */
  group?: string;
  /** `global` = one value for the whole session; `story` = a value per
   *  selected story, seeded from its story file, that lasts until another story
   *  is selected. */
  scope: 'global' | 'story';
  /** How the value hits the canvas. */
  apply: OptionApply;
}

/**
 * An option a shell declares for itself, such as its own color mode or
 * density: a {@link PreviewOption} without `apply` or `scope`. Its value
 * never reaches the kit's iframes; the shell reads it from the preview's
 * state under the id {@link shellOptionId} gives it, and it is global.
 */
export type PreviewShellOption = Omit<PreviewOption, 'apply' | 'scope'>;

/**
 * The id a shell option has in the preview's state, address and storage.
 *
 * @param id - The option's id as the shell declares it.
 * @returns The id prefixed with `shell.`.
 * @example
 * ```ts
 * shellOptionId('mode'); // 'shell.mode'
 * ```
 */
export function shellOptionId(id: string): string {
  return `${SHELL_OPTION_PREFIX}${id}`;
}

/** The kit-authored canvas styling: what the preview page paints with. The
 *  preview's canvas stylesheet is a generic template over these values - the
 *  kit's token vocabulary lives HERE, never in the preview. Any wrapper
 *  geometry (surface fills, insets, padding) a kit wants lives in `extraCss`,
 *  keyed off the nodes it declares in `mount`. Values are raw CSS. */
export interface PreviewCanvasConfiguration {
  /** Prefix for every preview-owned DOM name - injected element ids, the
   *  class-apply data attribute (`data-<prefix>-preview-class`). */
  namePrefix: string;
  /** Canvas page background, painted on `<body>`. Optional: a kit whose
   *  stylesheet already states its page canvas (the kit's own `html`/`body`
   *  rules, loaded with the theme) omits it, and the preview paints nothing -
   *  the preview document *is* the kit's page, and what the page is stays
   *  the kit's (and the theme's) call rather than a value restated here. */
  pageBackground?: string;
  /** Extra kit-authored CSS appended to the canvas stylesheet - where a kit
   *  styles its `mount` wrapper nodes and any option-driven geometry. */
  extraCss?: string;
}

/** The canvas of a custom view's iframe, which shows a kit-authored view
 *  rather than a mounted component: no `mount` wrapper, so none of the
 *  component frame's geometry applies. A kit sets it as `viewCanvas`;
 *  without it a view gets `canvas.pageBackground` and nothing else. The
 *  name prefix stays `canvas.namePrefix`. Options still apply to a view,
 *  except one targeting a `mount` node by `ref`, which a view lacks. */
export interface PreviewViewCanvasConfiguration {
  /** The view page's background, painted on `<body>`. */
  pageBackground?: string;
  /** Extra kit-authored CSS for the view page. */
  extraCss?: string;
}

/** A node in a kit's `mount` wrapper tree - plain, framework-agnostic
 *  DOM rendered around the `#app` mount, identical across every preview iframe.
 *  The preview knows nothing of what these nodes mean; the kit styles them via
 *  `canvas.extraCss` and targets options at them by `ref`. */
export interface PreviewMountNode {
  /** Element tag. Defaults to `'div'`. */
  tag?: string;
  /** Static attributes rendered on the element (e.g. a surface-cascade attribute). */
  attributes?: Record<string, string>;
  /** Static class names. */
  classes?: string[];
  /** Inline `style` text. */
  style?: string;
  /** Name for the ref map - the handle `apply.target = { ref }` resolves to,
   *  and how kit CSS and option targeting address this node. */
  ref?: string;
  /** Child nodes, rendered in order. */
  children?: PreviewMountNode[];
  /** Marks the node the `#app` mount is reparented into. Exactly one node in
   *  the tree sets this. */
  mount?: boolean;
}

/**
 * The kind of an option: a choice when it has `values`, a boolean otherwise.
 *
 * @param option - The option.
 * @returns `'choice'` or `'boolean'`.
 * @example
 * ```ts
 * optionKind({ values: [{ value: 'light', label: 'light' }] }); // 'choice'
 * optionKind({}); // 'boolean'
 * ```
 */
export function optionKind(option: Pick<PreviewOption, 'values'>): OptionKind {
  return option.values !== undefined ? 'choice' : 'boolean';
}

/**
 * The group an option belongs to: its `group`, or `'context'` without one.
 *
 * @param option - The option.
 * @returns The group name.
 * @example
 * ```ts
 * optionGroup({ group: 'kit' }); // 'kit'
 * optionGroup({}); // 'context'
 * ```
 */
export function optionGroup(option: Pick<PreviewOption, 'group'>): string {
  return option.group ?? CONTEXT_OPTION_GROUP;
}

/**
 * Whether `value` is a value `option` can hold: one of its values for a
 * choice, a boolean for a boolean.
 *
 * @param option - The option.
 * @param value - The candidate value.
 * @returns Whether the option accepts it.
 */
export function acceptsOptionValue(
  option: Pick<PreviewOption, 'values'>,
  value: unknown
): value is OptionValue {
  if (optionKind(option) === 'boolean') return typeof value === 'boolean';
  return (
    typeof value === 'string' &&
    (option.values ?? []).some((choice) => choice.value === value)
  );
}

/** Every key of `T`, each `true`: a record a key list is read from, so a
 *  field added to `T` fails to type-check until the record lists it. */
type KeySet<T> = { [Key in keyof Required<T>]: true };

/** The keys an option takes. */
const OPTION_KEYS = Object.keys({
  id: true,
  label: true,
  title: true,
  values: true,
  default: true,
  group: true,
  scope: true,
  apply: true,
} satisfies KeySet<PreviewOption>);

/** The keys a choice option's value takes. */
const CHOICE_KEYS = Object.keys({
  value: true,
  label: true,
} satisfies KeySet<OptionChoice>);

/** The keys each apply strategy takes, by its type: one entry per member of
 *  `OptionApply`, listing every key of that member. A strategy of a type
 *  the preview does not know is not checked. */
const APPLY_KEY_SETS = {
  'root-attribute': {
    type: true,
    attribute: true,
    target: true,
    omitAtDefault: true,
  },
  stylesheet: { type: true },
  class: { type: true, on: true, className: true, target: true },
  'css-var': { type: true, var: true, target: true },
} satisfies {
  [Type in OptionApply['type']]: KeySet<Extract<OptionApply, { type: Type }>>;
};
const APPLY_KEYS: Record<string, readonly string[]> = Object.fromEntries(
  Object.entries(APPLY_KEY_SETS).map(([type, keys]) => [
    type,
    Object.keys(keys),
  ])
);

/** The keys of `value` that are not among `allowed`, `skipped` aside. A
 *  key set to `undefined` is absent. */
function unknownKeys(
  value: object,
  allowed: readonly string[],
  skipped: readonly string[] = []
): string[] {
  return Object.entries(value)
    .filter(
      ([key, entry]) =>
        entry !== undefined && !allowed.includes(key) && !skipped.includes(key)
    )
    .map(([key]) => key);
}

/**
 * The problems with a kit's options, each naming the option: a missing or
 * repeated id, a scope other than `global` or `story`, an option whose
 * kind is ambiguous - a choice needs `values` and a string `default` among
 * them, a boolean no `values` and a boolean `default` - and a key the
 * option, one of its values or its `apply` does not take. Empty when every
 * option is sound.
 *
 * @param options - The preview block's `options`.
 * @returns One message per problem.
 */
export function optionProblems(options: unknown): string[] {
  if (!Array.isArray(options)) return ['preview.options must be an array'];
  const problems: string[] = [];
  const seen = new Set<string>();
  options.forEach((candidate: unknown, index) => {
    const option = candidate as Partial<PreviewOption> &
      Record<string, unknown>;
    if (!option || typeof option !== 'object') {
      problems.push(`preview.options[${index}] must be an object`);
      return;
    }
    const name =
      typeof option.id === 'string' && option.id
        ? `preview.options[${index}] ('${option.id}')`
        : `preview.options[${index}]`;
    if (typeof option.id !== 'string' || !option.id) {
      problems.push(`${name}: id must be a non-empty string`);
    } else if (seen.has(option.id)) {
      problems.push(`${name}: another option has the id '${option.id}'`);
    } else {
      seen.add(option.id);
    }
    if (typeof option.label !== 'string')
      problems.push(`${name}: label must be a string`);
    if (option.scope !== 'global' && option.scope !== 'story')
      problems.push(`${name}: scope must be 'global' or 'story'`);
    if (
      option.group !== undefined &&
      (typeof option.group !== 'string' || !option.group)
    )
      problems.push(`${name}: group must be a non-empty string`);
    if ('slot' in option)
      problems.push(
        `${name}: slot is not an option field - an option says where it belongs with group`
      );
    if ('control' in option)
      problems.push(
        `${name}: control is not an option field - an option with values is a choice, one with a boolean default a boolean`
      );
    // `slot` and `control` are named above with where their meaning went.
    for (const key of unknownKeys(option, OPTION_KEYS, ['slot', 'control']))
      problems.push(
        `${name}: unknown key '${key}'; an option takes ${OPTION_KEYS.join(', ')}`
      );
    if (option.values !== undefined) {
      const values = option.values as unknown;
      if (
        !Array.isArray(values) ||
        values.length === 0 ||
        values.some(
          (choice: Partial<OptionChoice>) =>
            !choice ||
            typeof choice.value !== 'string' ||
            typeof choice.label !== 'string'
        )
      ) {
        problems.push(
          `${name}: values must be a non-empty list of { value, label } strings`
        );
      } else if (typeof option.default !== 'string') {
        problems.push(
          `${name}: a choice option (one with values) needs a string default`
        );
      } else if (
        !values.some((choice: OptionChoice) => choice.value === option.default)
      ) {
        problems.push(
          `${name}: default '${option.default}' is not one of its values`
        );
      }
    } else if (typeof option.default !== 'boolean') {
      problems.push(
        `${name}: an option without values is a boolean and needs a boolean default; a choice lists its values`
      );
    }
    if (Array.isArray(option.values))
      option.values.forEach((choice: unknown, choiceIndex) => {
        if (!choice || typeof choice !== 'object') return;
        for (const key of unknownKeys(choice, CHOICE_KEYS))
          problems.push(
            `${name}: unknown key 'values[${choiceIndex}].${key}'; a value takes ${CHOICE_KEYS.join(', ')}`
          );
      });
    if (!option.apply || typeof option.apply !== 'object') {
      problems.push(
        `${name}: apply must describe how the value hits the canvas`
      );
    } else {
      const type = (option.apply as { type?: unknown }).type;
      if (typeof type === 'string' && Object.hasOwn(APPLY_KEYS, type)) {
        const allowed = APPLY_KEYS[type];
        for (const key of unknownKeys(option.apply, allowed))
          problems.push(
            `${name}: unknown key 'apply.${key}'; a '${type}' apply takes ${allowed.join(', ')}`
          );
      }
    }
  });
  return problems;
}

/** The option registry keyed by id - O(1) lookup when applying a payload. */
export function optionsById(
  options: PreviewOption[]
): Record<string, PreviewOption> {
  return Object.fromEntries(options.map((option) => [option.id, option]));
}

/** Default values for the options in a scope (or all scopes). */
export function optionDefaults(
  options: Array<Pick<PreviewOption, 'id' | 'default' | 'scope'>>,
  scope?: 'global' | 'story'
): Record<string, OptionValue> {
  const out: Record<string, OptionValue> = {};
  for (const option of options) {
    if (!scope || option.scope === scope) out[option.id] = option.default;
  }
  return out;
}

/**
 * The served URL of a theme's stylesheet (the generator copies it there).
 *
 * @param themeId - The theme's id.
 * @param baseUrl - The URL the preview is served under, ending in `/`; the
 *   root of the origin, `/`, by default.
 * @returns The stylesheet's URL, such as `/themes/light/theme.css`.
 */
export function themeHref(themeId: string, baseUrl = '/'): string {
  return `${baseUrl}themes/${themeId}/theme.css`;
}
