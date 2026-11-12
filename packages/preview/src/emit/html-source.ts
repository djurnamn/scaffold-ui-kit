// The html "source" of a story: not a source a consumer writes, but the markup
// the story renders to - the template rendered once, at build time, for the
// story's props and slot content. A kit's docs show it beside the React, Vue
// and Svelte snippets. It is markup only: no behavior, no comments, and it
// assumes the kit's stylesheet. A story with a part that has no markup form
// has no html source.

import {
  renderInstance,
  type RenderInstanceOptions,
} from '@js-template-engine/core';
import { bem } from '@js-template-engine/extension-bem';
import { tailwind } from '@js-template-engine/extension-tailwind';
import type {
  Attributes,
  Extension,
  Template,
  TemplateNode,
} from '@js-template-engine/types';
import type { KitStyling } from '../context.js';
import { componentNameFromFile } from '../lib/naming.js';
import { styleDeclarations } from '../lib/react-spelling.js';
import { collectParts, collectSlotComponents } from '../lib/slot-fill.js';
import type {
  EnumeratedComponent,
  HandWrittenMapping,
  JsonValue,
  SlotFill,
  StoryAround,
} from '../lib/types.js';

/** What the html printer needs beside the story itself. */
export interface HtmlStory {
  /** The component the story renders. */
  component: EnumeratedComponent;
  props: Record<string, JsonValue>;
  children?: SlotFill;
  named: Record<string, SlotFill>;
  /** The content beside the component, rendered as its siblings. */
  around?: StoryAround;
  /** Every component of the kit, for the references a template or fill makes. */
  components: readonly EnumeratedComponent[];
  styling: KitStyling;
  /** Values every expression can read: the kit's shared helpers. */
  scope: Record<string, unknown>;
  /** What each hand-written component renders as: `'content'`, or a template. */
  handWrittenComponents: Readonly<Record<string, HandWrittenMapping>>;
}

/** The story's markup, or what keeps it from having one. */
export type HtmlSourceResult =
  | {
      markup: string;
      /** The kit components the markup renders, by name: the story's own
       *  first, then each it composes or its slot content holds. */
      components: string[];
      /** What the render could not work out at rest - an expression reading
       *  a name only the component's script defines, such as its state - so
       *  the markup leaves it out and shows that part at a default. */
      warnings: string[];
    }
  | { markup?: undefined; missing: string[] };

/**
 * Renders a story to markup. A component written by hand renders as the kit
 * maps it - the content passed into it, at rest, or the template it names -
 * inside one comment saying its behavior is not included; a slot fill
 * written per framework (`raw`, `scoped`) renders its `html`. A part renders
 * as a component whose template is its `html`, calling itself as deep as
 * the data it is given goes. A component without a template that the kit
 * does not map, or such a fill or part without `html`, leaves the story
 * with no markup, and the result names them. What the render cannot work
 * out at rest, such as an expression reading the component's script state,
 * is left out of the markup and named in the result's warnings.
 */
export function htmlSource(story: HtmlStory): HtmlSourceResult {
  const templates = new Map<string, Template>();
  // The kit component each template key (a name or an export name) is.
  const componentOf = new Map<string, string>();
  const fills: FillMarkup = { markups: [], missing: [] };
  // The story's parts, as components of its own; a part's name wins over a
  // kit component's.
  const parts = new Map<string, Template>();
  const besideFills = [story.around?.before, story.around?.after];
  for (const part of collectParts([
    story.children,
    ...Object.values(story.named),
    ...besideFills,
  ]).values()) {
    if (part.html === undefined) {
      fills.missing.push(`the part ${part.name}, with no html`);
      continue;
    }
    parts.set(part.name, {
      type: 'component',
      name: part.name,
      props: Object.fromEntries(
        part.parameters.map((name) => [name, { type: 'unknown' }])
      ),
      children: part.html,
    });
  }
  for (const entry of story.components) {
    const template = namedTemplate(entry);
    if (template === undefined) continue;
    templates.set(entry.name, template);
    componentOf.set(entry.name, entry.name);
    if (entry.exportName !== undefined) {
      templates.set(entry.exportName, template);
      componentOf.set(entry.exportName, entry.name);
    }
  }
  const rendered = new Set<string>();
  if (story.component.template !== undefined)
    rendered.add(story.component.name);
  // A hand-written component's own props, read from its specification.
  const ownProps = new Map<string, EnumeratedComponent['props']>();
  for (const entry of story.components) {
    if (entry.template !== undefined) continue;
    ownProps.set(entry.name, entry.props);
    if (entry.exportName !== undefined)
      ownProps.set(entry.exportName, entry.props);
  }
  const slots: Record<string, SlotContent> = {};
  for (const [name, fill] of Object.entries(story.named))
    slots[name] = slotContent(fill, fills);
  const children =
    story.children === undefined
      ? undefined
      : slotContent(story.children, fills);

  // A component with no template renders as a reference to itself, which the
  // resolver answers from the kit's map or leaves unresolved.
  const template: Template = namedTemplate(story.component) ?? [
    {
      type: 'element',
      tag: story.component.exportName ?? story.component.name,
      attributes: attributesOf(story.props),
      ...(children === undefined
        ? {}
        : {
            children: children.content,
            ...(children.slotScope === undefined
              ? {}
              : { slotScope: children.slotScope }),
          }),
      ...(Object.keys(slots).length === 0 ? {} : { slots }),
    },
  ];
  const resolveComponent: RenderInstanceOptions['resolveComponent'] = (tag) => {
    const part = parts.get(tag);
    if (part !== undefined) return part;
    const template = templates.get(tag);
    if (template !== undefined) {
      rendered.add(componentOf.get(tag) ?? tag);
      return template;
    }
    const mapping = handWrittenMapping(story.handWrittenComponents[tag]);
    if (mapping === undefined) return undefined;
    if (mapping.template === 'content') return { rendersAs: 'content' };
    const target = templates.get(mapping.template);
    if (target !== undefined)
      rendered.add(componentOf.get(mapping.template) ?? mapping.template);
    return target === undefined
      ? undefined
      : {
          rendersAs: target,
          props: Object.keys(ownProps.get(tag) ?? {}),
          ...(mapping.slots === undefined ? {} : { slots: mapping.slots }),
        };
  };
  const shared: RenderInstanceOptions = {
    componentName: story.component.name,
    resolveComponent,
    scope: story.scope,
    extensions: stylingExtensions(story.styling),
    placement: story.styling.placement,
  };
  const own = renderInstance(template, {
    ...shared,
    props: story.props,
    children,
    slots,
  });
  // The content beside the component renders on its own, as its siblings.
  const beside = besideFills.map((fill) =>
    fill === undefined
      ? undefined
      : renderInstance(fillNodes(fill, fills), shared)
  );
  const renders = [beside[0], own, beside[1]].filter(
    (result) => result !== undefined
  );
  const markup = renders.map((result) => result.markup).join('\n');
  const unresolved = [
    ...new Set(renders.flatMap((result) => result.unresolved)),
  ];
  const warnings = renders.flatMap((result) => result.warnings);
  const missing = [
    ...unresolved.map((name) =>
      story.handWrittenComponents[name] === undefined
        ? `${name}, a component with no template that handWrittenComponents does not map`
        : `${name}, mapped to ${handWrittenMapping(story.handWrittenComponents[name])?.template}, which is no template of the kit`
    ),
    ...fills.missing,
  ];
  if (missing.length > 0) return { missing };
  // Each fill's markup went in as a placeholder text node; it takes its place.
  const filled = markup.replace(
    /\uE000(\d+)\uE001/g,
    (_, index: string) => fills.markups[Number(index)]
  );
  // A fill written per framework names the kit components its markup holds.
  const referenced = new Set<string>();
  for (const fill of [
    story.children,
    ...Object.values(story.named),
    ...besideFills,
  ])
    collectSlotComponents(fill, referenced);
  for (const name of referenced) {
    const component = componentOf.get(name);
    if (component !== undefined) rendered.add(component);
  }
  return {
    markup: `${filled}\n`,
    components: [...rendered],
    // Only the expressions left out: a styling extension's notices belong
    // to the kit's build.
    warnings: [
      ...new Set(
        warnings
          .filter((warning) => warning.kind === 'unevaluated')
          .map((warning) => warning.message)
      ),
    ],
  };
}

/**
 * A component's template under the name the kit's build gives it. A bare
 * node array takes its file-derived name, as the build does, so its
 * `data-jte-node` markers match the kit's stylesheet whichever tag or
 * hand-written component reaches it.
 */
function namedTemplate(entry: EnumeratedComponent): Template | undefined {
  const template = entry.template;
  if (template === undefined || !Array.isArray(template)) return template;
  return {
    type: 'component',
    name: componentNameFromFile(entry.file),
    children: template,
  };
}

/** A hand-written component's entry in the kit's map, in its object form. */
function handWrittenMapping(
  entry: HandWrittenMapping | undefined
): { template: string; slots?: Record<string, string> } | undefined {
  return typeof entry === 'string' ? { template: entry } : entry;
}

/** A story's slot content, with the scope names a scoped fill takes. */
interface SlotContent {
  content: TemplateNode[];
  slotScope?: string[];
}

/**
 * A top-level fill as slot content. A scoped fill whose html is template
 * nodes reads the values the slot exposes under its parameter names.
 */
function slotContent(fill: SlotFill, fills: FillMarkup): SlotContent {
  const content = fillNodes(fill, fills);
  return fill.kind === 'scoped' && Array.isArray(fill.html)
    ? { content, slotScope: fill.parameters }
    : { content };
}

/** The markup of the fills written per framework, collected as the tree is read. */
interface FillMarkup {
  /** Each `raw` or `scoped` fill's html, by placeholder index. */
  markups: string[];
  /** The fills with no html. */
  missing: string[];
}

function stylingExtensions(styling: KitStyling): Extension[] {
  return styling.extensions.map((name) =>
    name === 'bem' ? bem(styling.bem) : tailwind(styling.tailwind)
  );
}

/**
 * A slot fill as template nodes. A fill written per framework becomes a
 * placeholder for its html, which is markup and so cannot be a node.
 */
function fillNodes(fill: SlotFill, fills: FillMarkup): TemplateNode[] {
  switch (fill.kind) {
    case 'text':
      return [{ type: 'text', content: fill.value }];
    case 'fragment':
      return fill.children.flatMap((child) => fillNodes(child, fills));
    case 'html':
      return [
        {
          type: 'element',
          tag: fill.tag,
          attributes: attributesOf(fill.props ?? {}),
          ...(fill.children === undefined
            ? {}
            : { children: fillNodes(fill.children, fills) }),
        },
      ];
    case 'element': {
      const slots: Record<string, TemplateNode[]> = {};
      for (const [name, slotFill] of Object.entries(fill.slots ?? {}))
        slots[name] = fillNodes(slotFill, fills);
      return [
        {
          type: 'element',
          tag: fill.component,
          attributes: attributesOf(fill.props ?? {}),
          ...(fill.children === undefined
            ? {}
            : { children: fillNodes(fill.children, fills) }),
          ...(Object.keys(slots).length === 0 ? {} : { slots }),
        },
      ];
    }
    case 'part':
      // The part renders as the component the story declares it as; one
      // with no html is already named as missing.
      if (fill.html === undefined) return [];
      return [
        {
          type: 'element',
          tag: fill.name,
          attributes: attributesOf(fill.props ?? {}),
        },
      ];
    case 'raw':
    case 'scoped': {
      // Template nodes render like any other content, composed components
      // included.
      if (Array.isArray(fill.html)) return fill.html;
      if (fill.html === undefined) {
        fills.missing.push(
          fill.kind === 'raw'
            ? 'a raw slot fill with no html'
            : `a scoped slot fill (${fill.parameters.join(', ')}) with no html`
        );
      }
      // A fill with no html still holds its place, so its slot is not empty;
      // the story then has no markup at all.
      fills.markups.push(typeof fill.html === 'string' ? fill.html : '');
      return [
        {
          type: 'text',
          content: `\uE000${fills.markups.length - 1}\uE001`,
        },
      ];
    }
  }
}

/**
 * Props as template attributes. A value an attribute cannot hold - an
 * object, an array - is passed as an expression, so it still reaches a
 * resolved component as its prop. A `style`, given as CSS text or an object,
 * is a whole-object style expression, so it is written inline.
 */
function attributesOf(props: Record<string, JsonValue>): Attributes {
  const attributes: Attributes = {};
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (name === 'style') {
      const style = typeof value === 'string' ? styleObject(value) : value;
      attributes.style = { $expression: JSON.stringify(style) };
      continue;
    }
    attributes[name] =
      typeof value === 'object'
        ? { $expression: JSON.stringify(value) }
        : value;
  }
  return attributes;
}

/** CSS declarations - `padding-left: 2ch; color: red` - as a style object,
 *  a `;` inside quotes or parentheses (`url("data:...;base64,...")`) kept. */
function styleObject(css: string): Record<string, string> {
  const style: Record<string, string> = {};
  for (const declaration of styleDeclarations(css)) {
    const colon = declaration.indexOf(':');
    if (colon === -1) continue;
    const property = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).trim();
    if (property !== '' && value !== '') style[property] = value;
  }
  return style;
}
