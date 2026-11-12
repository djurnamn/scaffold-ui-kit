// Emit the Svelte render layer. Svelte content regions aren't props, so each
// component gets a thin `<Name>.render.svelte` wrapper that forwards `props`
// (one object whose props are each a signal of their own, keeping controls
// live without remounting) and fills its regions. The registry maps component id → its wrapper
// component. The generated components are runes components that expose
// their regions as **named snippet props**, so the wrapper is a runes component
// filling them with `{#snippet name()}...{/snippet}` (the default region stays the
// implicit `children` snippet - loose content between the tags).

import {
  effectiveDefaultSlot,
  namedSlots,
  serialize,
  svelteText,
  type DefaultSlot,
} from './common.js';
import { storyRegistryId } from '../lib/scenario-story.js';
import { collectParts } from '../lib/slot-fill.js';
import { isVoidElement } from '../lib/void-elements.js';
import type {
  JsonValue,
  SlotFill,
  ResolvedStory,
  Target,
} from '../lib/types.js';

function svelteProps(props: Record<string, JsonValue> | undefined): string {
  return props
    ? ' ' +
        Object.entries(props)
          .map(([name, value]) =>
            typeof value === 'boolean' && value
              ? name
              : `${name}={${serialize(value)}}`
          )
          .join(' ')
    : '';
}

// Fill a component's named region: a runes named snippet prop, `{#snippet
// name()}...{/snippet}` (the region name is the snippet prop the generated
// component declares). Shared by nested elements and buildWrapper's top-level
// named regions.
function namedSlotMarkup(slots: Record<string, SlotFill> | undefined): string {
  return Object.entries(slots ?? {})
    .map(([slot, fill]) => {
      // A scoped fill becomes a snippet named per target (`fill.slot.svelte`) receiving
      // the destructured scope - Svelte 5's render-prop analog; empty body omits it.
      if (fill.kind === 'scoped')
        return fill.svelte
          ? `{#snippet ${fill.slot.svelte}({ ${fill.parameters.join(', ')} })}${fill.svelte}{/snippet}`
          : '';
      return `{#snippet ${slot}()}${slotSvelte(fill)}{/snippet}`;
    })
    .join('');
}

function elementSvelte(fill: Extract<SlotFill, { kind: 'element' }>): string {
  const inner = `${fill.children ? slotSvelte(fill.children) : ''}${namedSlotMarkup(fill.slots)}`;
  return `<${fill.component}${svelteProps(fill.props)}>${inner}</${fill.component}>`;
}

function htmlSvelte(fill: Extract<SlotFill, { kind: 'html' }>): string {
  // A void element (img, input, br) takes no children and no closing tag.
  if (isVoidElement(fill.tag))
    return `<${fill.tag}${svelteProps(fill.props)} />`;
  const inner = fill.children ? slotSvelte(fill.children) : '';
  return `<${fill.tag}${svelteProps(fill.props)}>${inner}</${fill.tag}>`;
}

function slotSvelte(fill: SlotFill): string {
  if (fill.kind === 'text') return svelteText(fill.value);
  if (fill.kind === 'raw') return fill.svelte;
  // A call to a part: the snippet the wrapper declares at its top.
  if (fill.kind === 'part')
    return `{@render ${fill.name}(${serialize(fill.props ?? {})})}`;
  // A scoped fill is only valid at a top-level named slot (namedSlotMarkup); ignored nested.
  if (fill.kind === 'scoped') return '';
  if (fill.kind === 'fragment') return fill.children.map(slotSvelte).join('');
  if (fill.kind === 'html') return htmlSvelte(fill);
  return elementSvelte(fill);
}

function defaultSvelte(def: DefaultSlot): string {
  if (!def) return '';
  if (def.kind === 'propText') return `{props[${JSON.stringify(def.prop)}]}`;
  // Scoped content for the default slot is the `children` snippet.
  if (def.kind === 'scoped') return namedSlotMarkup({ default: def });
  return slotSvelte(def);
}

function buildWrapper(
  model: ResolvedStory,
  def: DefaultSlot,
  named: Record<string, SlotFill>,
  moduleFor: (name: string, target: Target) => string,
  exportFor: (name: string) => string
): string {
  const imports = [model.name, ...model.slotComponents].filter(
    (name, i, names) => names.indexOf(name) === i
  );
  // Group imports by source module (insertion-ordered, the core source first) - a
  // wrapper for another package's component imports it from that package's module and a core
  // child from the core one.
  const byModule = new Map<string, string[]>();
  for (const name of imports) {
    const mod = moduleFor(name, 'svelte');
    (byModule.get(mod) ?? byModule.set(mod, []).get(mod)!).push(name);
  }
  // Alias another package's clean export to its unique preview name (`Toast as NoticeToast`).
  const importSpecifier = (name: string): string =>
    exportFor(name) === name ? name : `${exportFor(name)} as ${name}`;
  const importLines = [...byModule.entries()]
    .map(
      ([mod, names]) =>
        `  import { ${names.map(importSpecifier).join(', ')} } from '${mod}';`
    )
    .join('\n');
  const stripsChild = def?.kind === 'propText';
  // Runes wrapper: `props` is one object whose props are each a signal of
  // their own, so the component reads each prop on its own and a change to
  // one leaves the others as they are (a component's own two-way value
  // among them). When the default region is a `propText` prop it is
  // rendered as the child and left out of the spread by a view of `props`
  // that still reads each prop on its own - a copy would read them all.
  const reactive = stripsChild
    ? `  const rest = $derived(\n` +
      `    new Proxy(props, {\n` +
      `      get: (target, key) => (key === ${JSON.stringify(def.prop)} ? undefined : Reflect.get(target, key)),\n` +
      `      has: (target, key) => key !== ${JSON.stringify(def.prop)} && Reflect.has(target, key),\n` +
      `      ownKeys: (target) => Reflect.ownKeys(target).filter((key) => key !== ${JSON.stringify(def.prop)}),\n` +
      `    })\n` +
      `  );`
    : `  const rest = $derived(props);`;
  const namedMarkup = namedSlotMarkup(named);
  const defaultMarkup = defaultSvelte(def);
  // Svelte 5 turns a whitespace-only component body into a real (empty)
  // `children` snippet, which suppresses the component's default-slot fallback
  // - the opposite of a bare consumer usage. React trims whitespace-only JSX
  // children and Vue drops the whitespace-only slot, so to keep the three
  // targets' stories equivalent the wrapper self-closes when there is nothing
  // to fill, and emits only non-empty region lines otherwise.
  const regionLines = [defaultMarkup, namedMarkup]
    .filter((markup) => markup !== '')
    .map((markup) => `  ${markup}\n`)
    .join('');
  const componentMarkup = regionLines
    ? `<${model.name} {...rest}>\n${regionLines}</${model.name}>\n`
    : `<${model.name} {...rest} />\n`;
  // The content beside the component: its siblings, at the markup's top level.
  const before = model.around?.before;
  const after = model.around?.after;
  const mountMarkup =
    (before ? `${slotSvelte(before)}\n` : '') +
    componentMarkup +
    (after ? `${slotSvelte(after)}\n` : '');
  // The story's parts, snippets at the top of the markup: inside the
  // component's tags a snippet would be a prop of the component's.
  const partMarkup = [
    ...collectParts([
      before,
      model.slots?.default,
      ...Object.values(named),
      after,
    ]).values(),
  ]
    .map(
      (part) =>
        `{#snippet ${part.name}({ ${part.parameters.join(', ')} }: Record<string, any>)}${part.svelte}{/snippet}\n`
    )
    .join('');

  return (
    `<script lang="ts">\n` +
    `${importLines}\n` +
    `  let { props = {} }: { props?: Record<string, any> } = $props();\n` +
    `${reactive}\n` +
    `</script>\n\n` +
    partMarkup +
    mountMarkup
  );
}

/** The name a story's wrapper file and its import take: the component's,
 *  or a scenario story's own. */
function renderNameOf(model: ResolvedStory): string {
  return model.scenarioStory?.renderName ?? model.name;
}

export interface SvelteWrapper {
  fileName: string;
  source: string;
}

/** One `<Name>.render.svelte` wrapper per component (always - keeps the registry
 *  uniform; slotless components render `<Name {...rest} />`). */
export function emitSvelteWrapper(
  model: ResolvedStory,
  moduleFor: (name: string, target: Target) => string,
  exportFor: (name: string) => string = (name) => name
): SvelteWrapper {
  const def = effectiveDefaultSlot(model);
  const named = namedSlots(model);
  return {
    fileName: `${renderNameOf(model)}.render.svelte`,
    source: buildWrapper(model, def, named, moduleFor, exportFor),
  };
}

export function emitSvelteRegistry(models: ResolvedStory[]): string {
  const imports = models
    .map(
      (model) =>
        `import ${renderNameOf(model)}_render from './${renderNameOf(model)}.render.svelte';`
    )
    .join('\n');
  const entries = models
    .map(
      (model) =>
        `  ${JSON.stringify(storyRegistryId(model))}: ${renderNameOf(model)}_render,`
    )
    .join('\n');
  return (
    `// Generated by scaffold-ui-kit-preview - do not edit.\n` +
    `${imports}\n\n` +
    `export const registry: Record<string, any> = {\n` +
    entries +
    `\n};\n`
  );
}
