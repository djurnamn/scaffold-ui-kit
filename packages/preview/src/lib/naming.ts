// Id / title helpers. The id algorithm (lowercase, non-alphanumerics → '-',
// collapse, trim) keeps component ids deterministic and identical across the
// per-target registries and the host manifest - which is what the
// nav ↔ render lookup and the side-by-side iframe panes depend on. Pinned by
// naming.test.ts.

export function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

/** The id of the preview's own Empty scenario, which renders a component
 *  with its slots empty: no scenario of a story's takes it. */
export const EMPTY_SCENARIO_ID = 'empty';

/**
 * The id a pane mounts the story of one scenario by, when the scenario has
 * slot content of its own: the component's id and the scenario's, with two
 * hyphens between, which no component id holds.
 *
 * @param componentId - The component's story id.
 * @param scenarioId - The scenario's id.
 * @returns The scenario story's id.
 * @example
 * ```ts
 * scenarioStoryId('components-notice', 'warning'); // 'components-notice--warning'
 * ```
 */
export function scenarioStoryId(
  componentId: string,
  scenarioId: string
): string {
  return `${componentId}--${scenarioId}`;
}

export function storyId(title: string, exportName: string): string {
  return `${sanitize(title)}--${sanitize(exportName)}`;
}

/**
 * The name a kit's build gives a template without a component node, from its
 * file: the stem's alphanumeric runs in PascalCase, `_` before a leading
 * digit, `Component` when nothing is left (`theme-toggle.ts` → `ThemeToggle`,
 * `2up.grid.ts` → `_2upGrid`). A copy of `componentNameFromFilePath` in
 * scaffold-ui-kit's `template-sources.ts`, the source of truth, which this
 * package cannot import; the two must agree, since the name namespaces the
 * `data-jte-node` markers the kit's stylesheet selects.
 */
export function componentNameFromFile(file: string): string {
  const base = file.slice(
    Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')) + 1
  );
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const name = stem
    .split(/[^a-zA-Z0-9]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
  if (name === '') return 'Component';
  return /^[0-9]/.test(name) ? `_${name}` : name;
}
