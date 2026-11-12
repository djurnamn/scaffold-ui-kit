// The type names a component's generated module exports, which the kit's
// package entry re-exports with everything else the module exports: the
// exported declarations among a template's module-scope lines, as each
// target places them. Browser-safe.

import type { Target } from './types.js';

const IDENTIFIER = '[A-Za-z_$][\\w$]*';

/** A declaration that names a type: `export interface X`, `export type X =`,
 *  `export enum X`, `export class X` (each with `declare` or `abstract`). */
const TYPE_DECLARATION = new RegExp(
  `^\\s*export\\s+(?:declare\\s+)?(?:(?:abstract\\s+)?class|interface|type|(?:const\\s+)?enum)\\s+(${IDENTIFIER})`
);

/** An export list: `export { A, B as C }` or `export type { A } from '...'`. */
const EXPORT_LIST = /^\s*export\s+(type\s+)?\{([^}]*)\}/;

/**
 * The type names one module-scope line exports. A value-only export list
 * (`export { a }`) names no type unless a member is marked `type`, as a value
 * cannot be told from a type there.
 *
 * @param line - A verbatim module-scope line.
 * @returns The type names it exports, in order.
 */
export function exportedTypeNamesOf(line: string): string[] {
  const declaration = TYPE_DECLARATION.exec(line);
  if (declaration) return [declaration[1]];
  const list = EXPORT_LIST.exec(line);
  if (!list) return [];
  const typeOnly = list[1] !== undefined;
  return list[2]
    .split(',')
    .map((member) => member.trim())
    .filter((member) => member !== '' && (typeOnly || /^type\s/.test(member)))
    .map((member) =>
      member
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)
        .pop()!
        .trim()
    )
    .filter((name) => new RegExp(`^${IDENTIFIER}$`).test(name));
}

/** The parts of a template the exported types are read from. */
export interface ExportingTemplate {
  imports?: string[];
  extensions?: Record<string, unknown>;
}

/**
 * The type names a template's generated module exports in one scripted
 * target: those its module-scope lines declare, the target's own `imports`
 * merged in (or in their place, with `importsStrategy: 'replace'`).
 *
 * @param template - The component's template.
 * @param target - The scripted target.
 * @returns The exported type names, each once.
 * @example
 * ```ts
 * exportedTypeNames({ imports: ['export interface DateValue { day: string }'] }, 'react');
 * // ['DateValue']
 * ```
 */
export function exportedTypeNames(
  template: ExportingTemplate,
  target: Target
): string[] {
  const override = template.extensions?.[target] as
    | { imports?: unknown; importsStrategy?: unknown }
    | undefined;
  const own = Array.isArray(override?.imports)
    ? override.imports.filter(
        (line): line is string => typeof line === 'string'
      )
    : undefined;
  const lines =
    own === undefined
      ? (template.imports ?? [])
      : override?.importsStrategy === 'replace'
        ? own
        : [...(template.imports ?? []), ...own];
  return [
    ...new Set(
      lines.flatMap((entry) => entry.split('\n').flatMap(exportedTypeNamesOf))
    ),
  ];
}

/**
 * The type names a component's generated module exports, per scripted
 * target: none for a component written by hand, whose module the preview
 * does not read.
 *
 * @param component - The component, with the template it was read from.
 * @param targets - The scripted targets the kit builds.
 * @returns The names per target that exports any, or `undefined` when none does.
 */
export function exportedTypesOf(
  component: { template?: unknown },
  targets: readonly Target[]
): Partial<Record<Target, string[]>> | undefined {
  const template = component.template;
  if (!template || typeof template !== 'object' || Array.isArray(template))
    return undefined;
  const types: Partial<Record<Target, string[]>> = {};
  for (const target of targets) {
    const names = exportedTypeNames(template as ExportingTemplate, target);
    if (names.length > 0) types[target] = names;
  }
  return Object.keys(types).length > 0 ? types : undefined;
}
