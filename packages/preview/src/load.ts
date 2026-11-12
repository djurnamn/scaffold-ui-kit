// Load what the generator and the check both read from a kit: every source's
// components (globbed templates plus resolved manual specs),
// each paired with its story file. One loader, so the check sees exactly what
// generation renders.

import { enumerateComponents } from './enumerate.js';
import { resolveManualComponent } from './props-from.js';
import { loadStory } from './story.js';
import {
  paneWidthsProblem,
  type PreviewContext,
  type ResolvedSource,
} from './context.js';
import type {
  EnumeratedComponent,
  ManualComponentSpecification,
  PreviewPaneWidth,
  Story,
} from './lib/types.js';

/** The pane widths the kit offers and what is wrong with them. */
export interface KitPaneWidths {
  /** The widths: the preview block's `paneWidths`, else none (the
   *  preview's own). */
  paneWidths?: PreviewPaneWidth[];
  /** What makes the kit's widths unusable. */
  errors: string[];
}

/**
 * The pane widths a kit offers: its preview block's `paneWidths`, which a
 * kit can derive from its own breakpoints.
 *
 * @param context - The kit's preview context.
 * @returns The widths and the errors.
 */
export function kitPaneWidths(context: PreviewContext): KitPaneWidths {
  const paneWidths = context.configuration.paneWidths;
  if (paneWidths === undefined) return { errors: [] };
  const problem = paneWidthsProblem(paneWidths, 'preview.paneWidths');
  return problem ? { errors: [problem] } : { paneWidths, errors: [] };
}

/** A source's manual specs: the module's default export. */
type ManualModule = { default?: () => ManualComponentSpecification[] };

/** One component with its source and story file. */
export interface LoadedComponent {
  component: EnumeratedComponent;
  story: Story | undefined;
  source: ResolvedSource;
}

export interface LoadedKit {
  /** Every source's components, each source sorted by name, sources in order. */
  components: LoadedComponent[];
  /**
   * Each compound part, by name, with the root that lists it: in its
   * template's `parts`, or, for a root with no template, in the kit
   * configuration's. A listed part is not standalone, whatever its story
   * file says.
   */
  parts: Map<string, string>;
}

/** Loads every source's components and story files. */
export async function loadKit(context: PreviewContext): Promise<LoadedKit> {
  const { sources, importModule } = context;

  // Every source's templates first, so a manual component's `propsFrom` can
  // build on a template from any source - its own source's first.
  const templatesBySource = new Map<ResolvedSource, EnumeratedComponent[]>();
  for (const source of sources) {
    templatesBySource.set(
      source,
      source.templatesDirectoryAbsolute
        ? await enumerateComponents(
            source.templatesDirectoryAbsolute,
            importModule
          )
        : []
    );
  }

  // A compound's root names its parts, in its template or, with no template,
  // in the kit configuration; none is standalone, as a story file's
  // `standalone: false` also marks one.
  const parts = new Map<string, string>();
  for (const [root, rootParts] of Object.entries(context.parts ?? {})) {
    for (const part of rootParts) parts.set(part, root);
  }
  for (const templates of templatesBySource.values()) {
    for (const { name, template } of templates) {
      if (template && !Array.isArray(template)) {
        for (const part of template.parts ?? []) parts.set(part, name);
      }
    }
  }

  const components: LoadedComponent[] = [];
  for (const source of sources) {
    const templates = templatesBySource.get(source) ?? [];
    const visibleTemplates = [
      ...templates,
      ...sources
        .filter((other) => other !== source)
        .flatMap((other) => templatesBySource.get(other) ?? []),
    ];
    const manual = source.manualModuleAbsolute
      ? ((await importModule(source.manualModuleAbsolute)) as ManualModule)
      : undefined;
    if (source.manualModuleAbsolute && typeof manual?.default !== 'function') {
      throw new Error(
        `[preview] ${source.manualModule} must default-export a () => ManualComponentSpecification[]`
      );
    }
    const sourceComponents = [
      ...templates,
      ...(manual?.default
        ? manual
            .default()
            .map((specification) =>
              resolveManualComponent(
                specification,
                context.kitRoot,
                visibleTemplates
              )
            )
        : []),
    ].sort((a, b) => a.name.localeCompare(b.name));
    for (const listed of sourceComponents) {
      const component = parts.has(listed.name)
        ? { ...listed, standalone: false }
        : listed;
      const story = await loadStory(
        component.name,
        source.storiesDirectoryAbsolute,
        importModule
      );
      components.push({ component, story, source });
    }
  }
  return { components, parts };
}
