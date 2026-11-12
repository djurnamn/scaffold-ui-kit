// A story as consumer source per target, for a kit's docs: the component,
// the props its story file curates (and a scenario's), and its slot content,
// importing from the kit's package entry for each target - and the markup the
// story renders to, as html. Read from the same story files the preview renders,
// so the snippets follow them.

import { REACT_ATTRIBUTE_NAMES } from '@js-template-engine/extension-react';
import type { ConfigurationLookupOptions } from 'scaffold-ui-kit';
import { loadPreviewContext, type PreviewContext } from './context.js';
import { loadKit } from './load.js';
import { storyOnScenario } from './lib/scenario-story.js';
import { resolveStory } from './model.js';
import { declaredAttributes } from './lib/react-spelling.js';
import { moduleOfSource } from './lib/module-of-source.js';
import { htmlSource, type HtmlSourceResult } from './emit/html-source.js';
import {
  inDeclarationOrder,
  SOURCE_PRINTERS,
  type SourceStory,
} from './emit/source.js';
import { exportedTypesOf } from './lib/exported-types.js';
import { summarizeHtmlWarnings } from './lib/html-warnings.js';
import type {
  EnumeratedComponent,
  JsonValue,
  Scenario,
  Story,
  SlotFill,
  StoryAround,
  ResolvedStory,
  Target,
} from './lib/types.js';

/** What `storySource` prints: a framework's source, or the rendered markup. */
export type SourceTarget = Target | 'html';

/**
 * What `storySource` returns: the source per target, and, when the `html`
 * leaves something out, the warnings naming it.
 */
export type StorySource = Partial<Record<SourceTarget, string>> & {
  /** What the `html` could not work out at rest and left out, such as an
   *  expression reading the component's script state; the markup shows that
   *  part at a default. Absent when there is nothing to name. */
  htmlWarnings?: string[];
};

export interface StorySourceOptions extends ConfigurationLookupOptions {
  /** A scenario id (curated or generated); its props apply over the story's. */
  scenario?: string;
  /** The targets to print. Defaults to every target the component renders
   *  into, and `html`. */
  targets?: SourceTarget[];
}

/**
 * Prints a component's story as the source a consumer would write per target:
 * a React component, a Vue single-file component, a Svelte component. Imports
 * name the kit's package entry for each target (`<package>/react`); props are
 * those the story file sets (`defaultProps`, `fixed`) and the scenario's, leaving
 * out values equal to the template's declared default. A default slot the
 * story leaves unfilled prints no content. A two-way prop the story gives
 * is bound to state of the source's own, as a consumer controls
 * it: React's `useState` with the value and the change prop, Vue's `v-model`
 * or `v-model:<prop>`, Svelte's `bind:<prop>` on `$state` in runes mode or a
 * plain `let` in legacy mode, as the kit builds Svelte, its state typed by
 * the prop's declared type where that names types the kit's package entry
 * exports, imported from it. The prop its value starts from otherwise (its
 * default prop) is left out, as is a prop the scenario gives `null`, unless
 * it is a two-way prop the source binds. The `html` is the markup at the
 * given value.
 *
 * `html` is the markup the story renders to, at rest: the template rendered
 * once for those props and slot content, components it references rendered
 * inline, and assumes the kit's stylesheet. A component written by hand
 * renders as `handWrittenComponents` maps it - its content, or the template
 * it renders - inside one comment saying its behavior is not included, and
 * slot content written per framework renders its `html`. A story with any
 * other part that has no markup gets no `html`, with a warning naming it.
 * What the markup cannot work out at rest, such as an expression reading the
 * component's script state, is left out, shows at a default, and is named
 * once in `htmlWarnings` and a printed warning.
 *
 * @param kitRoot - The kit root (where its package.json lives)
 * @param componentName - The component, by name
 * @param options - The scenario and the targets to print, and the kit
 *   configuration file when it is not the one the kit root gives
 * @returns The source per target, and the html's warnings
 * @example
 * ```ts
 * const { react } = await storySource(kitRoot, 'Button', { scenario: 'variant-dense' });
 * ```
 */
export async function storySource(
  kitRoot: string,
  componentName: string,
  options: StorySourceOptions = {}
): Promise<StorySource> {
  const context = loadPreviewContext(kitRoot, {
    configuration: options.configuration,
    workingDirectory: options.workingDirectory,
  });
  const { components } = await loadKit(context);
  const loaded = components.find(
    (entry) => entry.component.name === componentName
  );
  if (!loaded) {
    throw new Error(
      `[preview] no component named ${componentName} in ${kitRoot}`
    );
  }
  const { component, story } = loaded;
  const model = resolveStory(
    component,
    story,
    context.configuration.controlHints ?? {},
    context.configuration.labels,
    context.omitPattern,
    context.targets
  );

  let scenarioProps: Record<string, JsonValue> = {};
  let scenario: Scenario | undefined;
  if (options.scenario !== undefined) {
    scenario = model.scenarios.find((entry) => entry.id === options.scenario);
    if (!scenario) {
      throw new Error(
        `[preview] ${componentName} has no scenario '${options.scenario}'; it has ${model.scenarios.map((entry) => `'${entry.id}'`).join(', ') || 'none'}`
      );
    }
    scenarioProps = scenario.props ?? {};
  }
  // A scenario with slot content of its own prints that over the story's.
  const { props, children, named, around } = sourceStoryOf(
    component,
    story,
    storyOnScenario(model, scenario),
    scenarioProps
  );

  // Each component imports from its source's package entry, as generation does.
  const loadedByName = new Map(
    components.map((entry) => [entry.component.name, entry])
  );
  const defaultModule = context.sources[0].moduleBase;
  const importsFor = (target: Target): SourceStory['imports'] => {
    const imports: SourceStory['imports'] = new Map();
    for (const name of [model.name, ...model.slotComponents]) {
      const entry = loadedByName.get(name);
      imports.set(name, {
        module:
          entry?.component.importModule?.[target] ??
          moduleOfSource(entry?.source.moduleBase ?? defaultModule, target),
        exported: entry?.component.exportName ?? name,
        ...(entry
          ? {
              declaredAttributes: declaredAttributes(
                Object.keys(entry.component.props),
                REACT_ATTRIBUTE_NAMES
              ),
            }
          : {}),
      });
    }
    return imports;
  };
  // The types each component's module exports, which a bound prop's state
  // is typed by where its declared type names them.
  const exportedTypesFor = (target: Target): Map<string, string> => {
    const types = new Map<string, string>();
    // A component's own name, or the name it is exported under, is a value.
    const values = new Set(
      components.flatMap((entry) => [
        entry.component.name,
        entry.component.exportName ?? entry.component.name,
      ])
    );
    // The story's own component first, so its type wins a name another
    // component's module exports too.
    const ordered = [
      ...components.filter((entry) => entry.component.name === componentName),
      ...components.filter((entry) => entry.component.name !== componentName),
    ];
    for (const entry of ordered)
      for (const type of exportedTypesOf(entry.component, [target])?.[target] ??
        [])
        if (!types.has(type) && !values.has(type))
          types.set(
            type,
            entry.component.importModule?.[target] ??
              moduleOfSource(entry.source.moduleBase ?? defaultModule, target)
          );
    return types;
  };

  // A two-way prop the story gives is controlled: its source binds it.
  const declaredTypes = new Map(
    model.propTypes.map((propType) => [propType.name, propType.declaredType])
  );
  const bindings = (model.bindings ?? [])
    .filter((binding) => binding.prop in props)
    .map((binding) => {
      const declaredType = declaredTypes.get(binding.prop);
      return { ...binding, ...(declaredType ? { declaredType } : {}) };
    });

  const requested = options.targets ?? [...model.targets, 'html'];
  const sources: StorySource = {};
  for (const target of requested) {
    if (target === 'html') {
      const result = await printHtmlSource(
        context,
        components.map((entry) => entry.component),
        { component, props, children, named, around }
      );
      if (result.markup !== undefined) {
        sources.html = result.markup;
        if (result.warnings.length > 0) {
          sources.htmlWarnings = result.warnings;
          console.warn(
            `[preview] ${htmlWarningLine(componentName, result.warnings)}`
          );
        }
      } else {
        console.warn(
          `[preview] ${componentName} has no html source: it holds ${result.missing.join('; ')}`
        );
      }
      continue;
    }
    if (!model.targets.includes(target)) continue;
    sources[target] = SOURCE_PRINTERS[target]({
      component: model.name,
      props,
      children,
      named,
      ...(around ? { around } : {}),
      imports: importsFor(target),
      ...(bindings.length > 0 ? { bindings } : {}),
      svelteMode: context.svelteMode,
      reactAttributeNames: REACT_ATTRIBUTE_NAMES,
      exportedTypes: exportedTypesFor(target),
    });
  }
  return sources;
}

/** A story as its source prints it: the props a consumer writes and its slot content. */
export interface SourceStoryContent {
  props: Record<string, JsonValue>;
  children?: SlotFill;
  named: Record<string, SlotFill>;
  /** The content beside the component, as its siblings. */
  around?: StoryAround;
}

/**
 * What a story's source prints for a scenario's props: the props the story file
 * sets (`defaultProps`, `fixed`) and the scenario's, less those equal to the
 * component's declared default, and the story file's slot content, or its
 * `children` text where it curates none. A default slot the story leaves
 * unfilled prints no content: the component's name the preview shows there
 * is the preview's own, which a consumer never writes, unless `placeholder`
 * asks for it, as the html the panes render does.
 *
 * @param component - The component.
 * @param story - Its story file, when it has one.
 * @param model - Its resolved story.
 * @param scenarioProps - The scenario's props.
 * @param options - `placeholder` keeps the preview's text in an unfilled default slot.
 * @returns The props and slot content to print.
 */
export function sourceStoryOf(
  component: EnumeratedComponent,
  story: Story | undefined,
  model: ResolvedStory,
  scenarioProps: Record<string, JsonValue>,
  options: { placeholder?: boolean } = {}
): SourceStoryContent {
  // What the story file and scenario set, not the preview's own control defaults.
  const props: Record<string, JsonValue> = {
    ...(story?.defaultProps ?? {}),
    ...(story?.fixed ?? {}),
    ...scenarioProps,
  };
  let children: SlotFill | undefined = model.slots?.default;
  const childrenText =
    'children' in props
      ? props.children
      : options.placeholder
        ? model.defaultProps.children
        : undefined;
  delete props.children;
  if (!children && typeof childrenText === 'string')
    children = { kind: 'text', value: childrenText };
  for (const [name, value] of Object.entries(props)) {
    const declared = component.props[name]?.default;
    if (
      value === undefined ||
      (declared !== undefined &&
        JSON.stringify(declared) === JSON.stringify(value))
    ) {
      delete props[name];
    }
  }
  return {
    props: inDeclarationOrder(props, Object.keys(component.props)),
    children,
    named: model.slots?.named ?? {},
    ...(model.around ? { around: model.around } : {}),
  };
}

/**
 * The lines that report what a story's html leaves out, once per story: a
 * heading, then each evaluation warning indented on a line of its own, a
 * warning about the story's own component without its name, and the
 * warnings one component gives for one reason as a single line counting
 * them (see `summarizeHtmlWarnings`).
 *
 * @param componentName - The story's component.
 * @param warnings - The expressions the html could not evaluate at rest.
 * @returns The lines, joined, without a prefix.
 */
export function htmlWarningLine(
  componentName: string,
  warnings: readonly string[]
): string {
  const own = `${componentName}: `;
  return [
    `${componentName}'s html leaves out what it cannot evaluate at rest:`,
    ...summarizeHtmlWarnings(warnings).map(
      (warning) =>
        `  ${warning.startsWith(own) ? warning.slice(own.length) : warning}`
    ),
  ].join('\n');
}

/**
 * Renders a story to the markup it shows at rest, with the kit's shared
 * modules in scope and its styling, as `storySource`'s `html` does.
 *
 * @param context - The kit's preview context.
 * @param components - Every component of the kit.
 * @param story - The component, its props and its slot content.
 * @returns The markup, or what the story holds that has none.
 */
export async function printHtmlSource(
  context: PreviewContext,
  components: readonly EnumeratedComponent[],
  story: SourceStoryContent & { component: EnumeratedComponent }
): Promise<HtmlSourceResult> {
  return htmlSource({
    scope: await sharedScope(context),
    component: story.component,
    props: story.props,
    children: story.children,
    named: story.named,
    ...(story.around ? { around: story.around } : {}),
    components,
    styling: context.styling,
    handWrittenComponents: context.configuration.handWrittenComponents ?? {},
  });
}

/**
 * The exports of `@scaffold-ui-kit/helpers`' framework-free entries and of
 * the kit's shared modules - the helpers its templates import by specifier -
 * under their names, later modules winning a clash, so a kit's own module
 * wins over the package. A module that fails to load contributes nothing; an
 * expression naming one of its exports is then a comment in the markup.
 */
async function sharedScope(
  context: PreviewContext
): Promise<Record<string, unknown>> {
  const scope: Record<string, unknown> = {};
  for (const modulePath of [
    ...context.helperModulesAbsolute,
    ...context.sharedModulesAbsolute,
  ]) {
    try {
      Object.assign(
        scope,
        (await context.importModule(modulePath)) as Record<string, unknown>
      );
    } catch {
      // Left out: the markup marks what depends on it.
    }
  }
  return scope;
}
