// Emit the Vue render-registry: a map of component id → a render unit
// `{ components, template }`. Slots aren't props in Vue, so slot content is
// rendered through a template (default slot inline, named slots via
// <template #name>); `props` flows via v-bind="props". The preview entry mounts
// each unit with a reactive `props` and the unit's components exposed in
// setup, so a template expression reads a component as a value
// (`:as="Button"`), as a script-setup import is read in an SFC.

import {
  effectiveDefaultSlot,
  joinVue,
  namedSlots,
  vueBoundAttribute,
  vueText,
  type DefaultSlot,
} from './common.js';
import { sanitize } from '../lib/naming.js';
import { storyRegistryId } from '../lib/scenario-story.js';
import { collectParts } from '../lib/slot-fill.js';
import { isVoidElement } from '../lib/void-elements.js';
import type {
  JsonValue,
  SlotFill,
  ResolvedStory,
  Target,
} from '../lib/types.js';

function vueProps(props: Record<string, JsonValue> | undefined): string {
  return props
    ? ' ' +
        Object.entries(props)
          .map(([name, value]) =>
            typeof value === 'boolean' && value
              ? name
              : `:${name}=${vueBoundAttribute(value)}`
          )
          .join(' ')
    : '';
}

function elementVue(fill: Extract<SlotFill, { kind: 'element' }>): string {
  // Named slots → `<template #name>` inside the element, like vueEntry's namedTemplates;
  // default content first, then the named templates.
  const namedTemplates = Object.entries(fill.slots ?? {})
    .map(([slot, slotFill]) => namedTemplateVue(slot, slotFill))
    .join('');
  const inner = `${fill.children ? slotVue(fill.children) : ''}${namedTemplates}`;
  return `<${fill.component}${vueProps(fill.props)}>${inner}</${fill.component}>`;
}

function htmlVue(fill: Extract<SlotFill, { kind: 'html' }>): string {
  // A void element (img, input, br) takes no children and no closing tag.
  if (isVoidElement(fill.tag)) return `<${fill.tag}${vueProps(fill.props)} />`;
  const inner = fill.children ? slotVue(fill.children) : '';
  return `<${fill.tag}${vueProps(fill.props)}>${inner}</${fill.tag}>`;
}

function slotVue(fill: SlotFill): string {
  if (fill.kind === 'text') return vueText(fill.value);
  if (fill.kind === 'raw') return fill.vue;
  // A call to a part: a component among the story's own.
  if (fill.kind === 'part') return `<${fill.name}${vueProps(fill.props)} />`;
  // A scoped fill is only valid at a top-level named slot (vueEntry); ignored nested.
  if (fill.kind === 'scoped') return '';
  if (fill.kind === 'fragment') return joinVue(fill.children.map(slotVue));
  if (fill.kind === 'html') return htmlVue(fill);
  return elementVue(fill);
}

/** A named-slot `<template>` - a scoped fill binds the slot's scope
 *  (`#name="{ args }"`), a plain fill renders inline. Empty scoped bodies omit the
 *  template. Shared by vueEntry and elementVue's nested named slots. */
function namedTemplateVue(slot: string, fill: SlotFill): string {
  if (fill.kind === 'scoped')
    return fill.vue
      ? `<template #${fill.slot.vue}="{ ${fill.parameters.join(', ')} }">${fill.vue}</template>`
      : '';
  return `<template #${slot}>${slotVue(fill)}</template>`;
}

function defaultVue(def: DefaultSlot): string {
  if (!def) return '';
  if (def.kind === 'propText') return `{{ props.${def.prop} }}`;
  // Scoped content for the default slot binds its scope on `#default`.
  if (def.kind === 'scoped') return namedTemplateVue('default', def);
  return slotVue(def);
}

// The `import * as` namespace per referenced module: the first module seen (the
// kit's own source - story order puts it first) keeps the terse `d`; every other
// module gets `d_<sanitized>`. First-seen assignment bakes in no kit name.
function vueNamespaces(
  models: ResolvedStory[],
  moduleFor: (name: string, target: Target) => string
): Map<string, string> {
  const namespaces = new Map<string, string>();
  for (const model of models) {
    for (const name of [model.name, ...model.slotComponents]) {
      const mod = moduleFor(name, 'vue');
      if (!namespaces.has(mod)) {
        namespaces.set(
          mod,
          namespaces.size === 0
            ? 'd'
            : 'd_' +
                mod
                  .replace(/\/(vue)$/, '')
                  .replace(/[^a-z0-9]+/gi, '_')
                  .replace(/^_+|_+$/g, '')
        );
      }
    }
  }
  return namespaces;
}

function vueEntry(
  model: ResolvedStory,
  moduleFor: (name: string, target: Target) => string,
  exportFor: (name: string) => string,
  namespaces: Map<string, string>
): string {
  const def = effectiveDefaultSlot(model);
  const named = namedSlots(model);
  const namedTemplates = Object.entries(named)
    .map(([slot, fill]) => namedTemplateVue(slot, fill))
    .join('');
  const inner = `${defaultVue(def)}${namedTemplates}`;
  // The placeholder text is the default slot's content. Bound too, a prop the
  // component doesn't declare falls through to its root element, where Vue
  // sets it as a DOM property (`children` is read-only there), so it's left
  // out of the binding; a declared prop of that name stays bound.
  const bound =
    def?.kind === 'propText' &&
    !model.propTypes.some((propType) => propType.name === def.prop)
      ? `(({ ${def.prop}: _, ...rest }) => rest)(props)`
      : 'props';
  const component = inner
    ? `<${model.name} v-bind="${bound}">${inner}</${model.name}>`
    : `<${model.name} v-bind="${bound}" />`;
  // The content beside the component: its siblings, as the template's other
  // roots.
  const before = model.around?.before;
  const after = model.around?.after;
  const template = `${before ? slotVue(before) : ''}${component}${after ? slotVue(after) : ''}`;
  const comps = [model.name, ...model.slotComponents].filter(
    (name, i, names) => names.indexOf(name) === i
  );
  // Local template name → the module's exported member (aliased when they differ).
  const componentMap = comps
    .map(
      (component) =>
        `${component}: ${namespaces.get(moduleFor(component, 'vue'))}.${exportFor(component)}`
    )
    .join(', ');
  // A part is a component of the story's, named so its template can call
  // itself, with the story's components in reach: as tags, and as values its
  // expressions read (`:as="Button"`), as a script-setup import is in an SFC.
  const parts = [
    ...collectParts([
      before,
      model.slots?.default,
      ...Object.values(named),
      after,
    ]).values(),
  ].map(
    (part) =>
      `, ${part.name}: { name: ${JSON.stringify(part.name)}, props: ${JSON.stringify(part.parameters)}, components: { ${componentMap} }, setup: () => ({ ${componentMap} }), template: ${JSON.stringify(part.vue)} }`
  );
  return `  ${JSON.stringify(storyRegistryId(model))}: { components: { ${componentMap}${parts.join('')} }, template: ${JSON.stringify(template)} },`;
}

export function emitVueRegistry(
  models: ResolvedStory[],
  moduleFor: (name: string, target: Target) => string,
  exportFor: (name: string) => string = (name) => name
): string {
  // One `import * as <ns>` per referenced module, insertion-ordered (the kit's
  // own source first).
  const namespaces = vueNamespaces(models, moduleFor);
  const importLines = [...namespaces.entries()]
    .map(([mod, ns]) => `import * as ${ns} from '${mod}';`)
    .join('\n');
  return (
    `// Generated by scaffold-ui-kit-preview - do not edit.\n` +
    `${importLines}\n\n` +
    `export interface VueUnit { components: Record<string, any>; template: string; }\n\n` +
    `export const registry: Record<string, VueUnit> = {\n` +
    models
      .map((model) => vueEntry(model, moduleFor, exportFor, namespaces))
      .join('\n') +
    `\n};\n`
  );
}
