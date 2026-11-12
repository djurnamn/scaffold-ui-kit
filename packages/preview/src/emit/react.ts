// Emit the React render-registry: a map of component id → a render function
// `(props) => <Component {...props}>...slots...</Component>`. React maps the default
// slot to JSX children and named slots to props (e.g. a popover's `trigger`).
// A story spells a component's attributes as HTML does in every target; the
// fills here are spelled as React takes them (lib/react-spelling.ts), and the
// registry exports what the React pane spells a story's live props with.

import {
  effectiveDefaultSlot,
  namedSlots,
  serialize,
  type DefaultSlot,
} from './common.js';
import { storyRegistryId } from '../lib/scenario-story.js';
import { REACT_ATTRIBUTE_NAMES } from '@js-template-engine/extension-react';
import { reactFill, styleProperties } from '../lib/react-spelling.js';
import { singleJsxRoot } from '../lib/jsx-roots.js';
import { collectParts } from '../lib/slot-fill.js';
import { isVoidElement } from '../lib/void-elements.js';
import type {
  JsonValue,
  PartFill,
  SlotFill,
  ResolvedStory,
  Target,
} from '../lib/types.js';

// A story file `style` string ('padding: 0 1ch;') → the React style object literal
// source. Story files author plain CSS text (the natural cross-target form - Vue and
// Svelte take it verbatim); only React needs the object mapping.
function styleObjectSource(css: string): string {
  const entries = Object.entries(styleProperties(css)).map(
    ([name, value]) =>
      `${name.startsWith('--') ? JSON.stringify(name) : name}: ${JSON.stringify(value)}`
  );
  return `{ ${entries.join(', ')} }`;
}

// A JSX attribute list from `props` (named slots become slot-as-prop attributes,
// like reactEntry's top-level `namedProps`). For HTML tags, `class` maps to the
// JSX `className` spelling and a `style` string becomes the object mapping React
// requires.
function jsxAttributes(
  props: Record<string, JsonValue> | undefined,
  slots: Record<string, SlotFill> | undefined,
  html: boolean
): string {
  const parts: string[] = [];
  for (const [propName, value] of Object.entries(props ?? {})) {
    const key = html && propName === 'class' ? 'className' : propName;
    if (html && propName === 'style' && typeof value === 'string') {
      parts.push(`style={${styleObjectSource(value)}}`);
      continue;
    }
    parts.push(
      typeof value === 'boolean' && value ? key : `${key}={${serialize(value)}}`
    );
  }
  for (const [slot, fill] of Object.entries(slots ?? {}))
    parts.push(`${slot}={${slotExpression(fill)}}`);
  return parts.length ? ' ' + parts.join(' ') : '';
}

function elementJsx(fill: Extract<SlotFill, { kind: 'element' }>): string {
  const inner = fill.children ? slotJsx(fill.children) : '';
  return `<${fill.component}${jsxAttributes(fill.props, fill.slots, false)}>${inner}</${fill.component}>`;
}

function htmlJsx(fill: Extract<SlotFill, { kind: 'html' }>): string {
  // A void element (img, input, br) takes no children and no closing tag.
  if (isVoidElement(fill.tag))
    return `<${fill.tag}${jsxAttributes(fill.props, undefined, true)} />`;
  const inner = fill.children ? slotJsx(fill.children) : '';
  return `<${fill.tag}${jsxAttributes(fill.props, undefined, true)}>${inner}</${fill.tag}>`;
}

// A call to a part: the function component the story's entry declares.
function partJsx(fill: PartFill): string {
  return `<${fill.name}${jsxAttributes(fill.props, undefined, false)} />`;
}

function slotJsx(fill: SlotFill): string {
  if (fill.kind === 'text') return `{${JSON.stringify(fill.value)}}`;
  if (fill.kind === 'raw') return fill.react;
  if (fill.kind === 'part') return partJsx(fill);
  // A scoped fill is only valid at a top-level named slot (reactEntry); ignored nested.
  if (fill.kind === 'scoped') return '';
  if (fill.kind === 'fragment') return fill.children.map(slotJsx).join('');
  if (fill.kind === 'html') return htmlJsx(fill);
  return elementJsx(fill);
}

// A scoped fill's React arrow head. Vue and Svelte always destructure `parameters` off
// one scope object; React takes either shape, so the fill says which. The default
// is the single scope object a generated component's scoped slot supplies - a
// render prop there is always called with one object, so the same `parameters` list is
// correct in all three emitters. `positional` keeps the separate-parameters form
// for a hand-written driver prop whose React side really is positional.
function reactArrowHead(fill: Extract<SlotFill, { kind: 'scoped' }>): string {
  return fill.reactScope === 'positional'
    ? `(${fill.parameters.join(', ')})`
    : `({ ${fill.parameters.join(', ')} })`;
}

// A slot fill in *prop* position (a named slot mapped to a React prop, e.g.
// `description={...}`). Unlike slotJsx (children position), the value must be a bare
// JSX *expression* - so text is a plain string literal (not `{"..."}`, which would
// double-brace) and a multi-child fragment is wrapped in `<>...</>` so it stays a
// single expression.
function slotExpression(fill: SlotFill): string {
  if (fill.kind === 'text') return JSON.stringify(fill.value);
  // A raw body of sibling roots, or of text, is one expression in a fragment.
  if (fill.kind === 'raw') return singleJsxRoot(fill.react);
  if (fill.kind === 'part') return partJsx(fill);
  // A scoped fill becomes a render-prop arrow (handled in reactEntry, not here).
  if (fill.kind === 'scoped')
    return `${reactArrowHead(fill)} => (${singleJsxRoot(fill.react)})`;
  if (fill.kind === 'fragment')
    return `<>${fill.children.map(slotJsx).join('')}</>`;
  if (fill.kind === 'html') return htmlJsx(fill);
  return elementJsx(fill);
}

function defaultJsx(def: DefaultSlot): string {
  if (!def) return '';
  if (def.kind === 'propText') return `{props.${def.prop}}`;
  // Scoped content for the default slot is the function child.
  if (def.kind === 'scoped') return def.react ? `{${slotExpression(def)}}` : '';
  return slotJsx(def);
}

function reactEntry(
  model: ResolvedStory,
  declares: (component: string, name: string) => boolean
): string {
  const given = effectiveDefaultSlot(model);
  const def: DefaultSlot =
    given?.kind === 'propText'
      ? given
      : reactFill(given, declares, REACT_ATTRIBUTE_NAMES);
  const named = Object.fromEntries(
    Object.entries(namedSlots(model)).map(([slot, fill]) => [
      slot,
      reactFill(fill, declares, REACT_ATTRIBUTE_NAMES),
    ])
  );
  const namedProps = Object.entries(named)
    .map(([slot, fill]) => {
      // A scoped fill maps to a render-prop named per target (`fill.slot.react`), not
      // the map key; an empty target body omits the prop.
      if (fill.kind === 'scoped')
        return fill.react
          ? ` ${fill.slot.react}={${slotExpression(fill)}}`
          : '';
      return ` ${slot}={${slotExpression(fill)}}`;
    })
    .join('');
  const children = defaultJsx(def);
  // The content beside the component: its siblings, in a fragment with it.
  const before = reactFill(
    model.around?.before,
    declares,
    REACT_ATTRIBUTE_NAMES
  );
  const after = reactFill(model.around?.after, declares, REACT_ATTRIBUTE_NAMES);
  const beside = before !== undefined || after !== undefined;
  const open = `${beside ? `<>${before ? slotJsx(before) : ''}` : ''}<${model.name} {...props}${namedProps}>`;
  const close = `</${model.name}>${beside ? `${after ? slotJsx(after) : ''}</>` : ''}`;
  const body = children ? `\n      ${children}\n    ` : '';
  const key = JSON.stringify(storyRegistryId(model));
  const parts = collectParts([
    before,
    model.slots?.default,
    ...Object.values(named),
    after,
  ]);
  if (parts.size === 0)
    return `  ${key}: (props) => (\n    ${open}${body}${close}\n  ),`;
  // The story's parts are function components declared in its entry, so two
  // stories can each declare a part of one name.
  const declarations = [...parts.values()]
    .map(
      (part) =>
        `    function ${part.name}({ ${part.parameters.join(', ')} }: Record<string, any>) {\n` +
        `      return ${part.react ? `(${singleJsxRoot(part.react)})` : 'null'};\n` +
        `    }\n`
    )
    .join('');
  return (
    `  ${key}: (() => {\n${declarations}` +
    `    return (props: Record<string, any>) => (\n      ${open}${children ? `\n        ${children}\n      ` : ''}${close}\n    );\n` +
    `  })(),`
  );
}

// Group a component into its source's module bucket (insertion-ordered, so the core
// source's import line comes first and other sources' lines append after it).
function addImport(
  byModule: Map<string, Set<string>>,
  mod: string,
  name: string
): void {
  let set = byModule.get(mod);
  if (!set) byModule.set(mod, (set = new Set()));
  set.add(name);
}

/**
 * The React render-registry module: each story's id → its render function.
 *
 * @param models - The stories React renders.
 * @param moduleFor - The module a component is imported from, per target.
 * @param exportFor - The name a component is exported under.
 * @param declaredAttributes - The names a component declares that React
 *   would otherwise respell (`class`, `style`, an attribute React renames),
 *   which it takes as they are; every other attribute a story gives a
 *   component is spelled as React takes it.
 * @returns The registry module's source: the `registry`, and the
 *   `reactAttributeNames` and `declaredAttributes` (of each story's root, by
 *   id) the React pane spells a story's live props with.
 */
export function emitReactRegistry(
  models: ResolvedStory[],
  moduleFor: (name: string, target: Target) => string,
  exportFor: (name: string) => string = (name) => name,
  declaredAttributes: (component: string) => readonly string[] = () => []
): string {
  const declares = (component: string, name: string): boolean =>
    declaredAttributes(component).includes(name);
  const rootDeclarations = Object.fromEntries(
    models
      .map((model) => [storyRegistryId(model), declaredAttributes(model.name)])
      .filter(([, names]) => names.length > 0)
  );
  const byModule = new Map<string, Set<string>>();
  for (const model of models) {
    addImport(byModule, moduleFor(model.name, 'react'), model.name);
    for (const slotComponent of model.slotComponents)
      addImport(byModule, moduleFor(slotComponent, 'react'), slotComponent);
  }
  // A component whose module export differs from its preview name is aliased on import
  // (`Toast as NoticeToast`) so another package's clean export can't clash with a core name.
  const importSpecifier = (name: string): string =>
    exportFor(name) === name ? name : `${exportFor(name)} as ${name}`;
  const importLines = [...byModule.entries()]
    .map(
      ([mod, names]) =>
        `import { ${[...names].map(importSpecifier).join(', ')} } from '${mod}';`
    )
    .join('\n');
  return (
    `// Generated by scaffold-ui-kit-preview - do not edit.\n` +
    `${importLines}\n\n` +
    `type RenderFn = (props: Record<string, any>) => any;\n\n` +
    `export const registry: Record<string, RenderFn> = {\n` +
    models.map((model) => reactEntry(model, declares)).join('\n') +
    `\n};\n\n` +
    `// How React spells the attributes it renames, by their HTML names.\n` +
    `export const reactAttributeNames: Record<string, string> = ${JSON.stringify(REACT_ATTRIBUTE_NAMES)};\n\n` +
    `// The names each story's root declares that React would otherwise respell.\n` +
    `export const declaredAttributes: Record<string, string[]> = ${JSON.stringify(rootDeclarations)};\n`
  );
}
