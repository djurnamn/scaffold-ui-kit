// Discover component templates by reading a source's templates directory,
// as the kit's build reads it, and importing each (default export = the
// defineTemplate object, which is plain data - defineTemplate is identity).
// Hand-written components live elsewhere, so they are naturally excluded.

import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { componentNameFromFile } from './lib/naming.js';
import { isTemplateFile } from './lib/template-files.js';
import { DeclarationResolver, resolveNamedType } from './props-from.js';
import { partitionImports } from '@js-template-engine/core';
import type { Template } from '@js-template-engine/types';
import type { EnumeratedComponent, ModuleImporter } from './lib/types.js';

/** Deep-walk a template tree collecting every `{ type: 'slot' }`: an unnamed one
 *  sets the default flag, a named one is added to the set, and one whose content
 *  must take its scope (`scopeRequired` beside `exposes`) is added, by name or as
 *  `default`, to `scopeRequired`. Walks every object value, `children` included,
 *  so slots projected through a `slots: { ... }` map on a composed element (e.g.
 *  Button forwarding its `icon` slot into IconLabel) are found too. */
function collectSlots(
  node: unknown,
  into: {
    default: boolean;
    defaultScoped: boolean;
    named: Set<string>;
    scopeRequired: Set<string>;
  }
): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectSlots(child, into);
    return;
  }
  const record = node as Record<string, unknown>;
  if (record.type === 'slot') {
    const exposes = record.exposes;
    const scoped = Boolean(
      exposes && typeof exposes === 'object' && Object.keys(exposes).length > 0
    );
    const named = typeof record.name === 'string' && record.name;
    if (named) into.named.add(named);
    else {
      into.default = true;
      if (scoped) into.defaultScoped = true;
    }
    if (scoped && record.scopeRequired === true)
      into.scopeRequired.add(named || 'default');
  }
  for (const value of Object.values(record)) collectSlots(value, into);
}

/** Whether any element in a template tree sets `passthrough`. */
function hasPassthrough(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(hasPassthrough);
  const record = node as Record<string, unknown>;
  return (
    record.passthrough === true || Object.values(record).some(hasPassthrough)
  );
}

type PropDefinition = EnumeratedComponent['props'][string];

/**
 * The props a discriminated surface root's branches declare, merged into one
 * definition per name: the branches' types joined (a `true` in one and a
 * `false` in another read as `boolean`), required only when every branch
 * requires it. Empty for any other root.
 */
function branchProps(children: unknown): Record<string, PropDefinition> {
  const roots = Array.isArray(children) ? children : [children];
  if (roots.length !== 1) return {};
  const [root] = roots as Array<Record<string, unknown> | undefined>;
  if (root?.type !== 'conditional' || !Array.isArray(root.conditions))
    return {};
  const branches = (
    root.conditions as Array<{ props?: Record<string, PropDefinition> }>
  ).map((condition) => condition.props ?? {});
  const names = [...new Set(branches.flatMap((props) => Object.keys(props)))];
  const merged: Record<string, PropDefinition> = {};
  for (const name of names) {
    const definitions = branches.map((props) => props[name]);
    const present = definitions.filter(
      (definition): definition is PropDefinition => definition !== undefined
    );
    const types = [...new Set(present.map((definition) => definition.type))];
    const type =
      types.includes('true') && types.includes('false')
        ? [
            'boolean',
            ...types.filter((each) => each !== 'true' && each !== 'false'),
          ].join(' | ')
        : types.join(' | ');
    const description = present.find(
      (definition) => definition.description
    )?.description;
    const documentedDefault = present.find(
      (definition) => definition.documentedDefault
    )?.documentedDefault;
    merged[name] = {
      type,
      ...(definitions.every((definition) => definition?.required === true)
        ? { required: true }
        : {}),
      ...(description ? { description } : {}),
      ...(documentedDefault ? { documentedDefault } : {}),
    };
  }
  return merged;
}

/** A component's shared props followed by any branch prop it does not share. */
function withBranchProps(
  shared: Record<string, PropDefinition>,
  children: unknown
): Record<string, PropDefinition> {
  const props = { ...shared };
  for (const [name, definition] of Object.entries(branchProps(children))) {
    if (!(name in props)) props[name] = definition;
  }
  return props;
}

/** The import statements a template declares, from every target's
 *  `extensions.<target>.imports`: the same names, from the same modules. */
function templateImports(extensions: unknown): string[] {
  if (!extensions || typeof extensions !== 'object') return [];
  const entries = Object.values(extensions as Record<string, unknown>)
    .flatMap((target) =>
      target && typeof target === 'object'
        ? ((target as { imports?: unknown }).imports ?? [])
        : []
    )
    .filter((entry): entry is string => typeof entry === 'string');
  return [...new Set(partitionImports(entries).importStatements)];
}

/** The props with each named type expanded through the template's imports, so
 *  a prop typed by an alias from another module reads as its members. */
function withResolvedTypes(
  props: Record<string, PropDefinition>,
  templatePath: string,
  imports: readonly string[],
  resolver: DeclarationResolver
): Record<string, PropDefinition> {
  if (imports.length === 0) return props;
  return Object.fromEntries(
    Object.entries(props).map(([name, definition]) => {
      const resolvedType = resolveNamedType(
        definition.type,
        templatePath,
        imports,
        resolver
      );
      return [
        name,
        resolvedType ? { ...definition, resolvedType } : definition,
      ];
    })
  );
}

export async function enumerateComponents(
  componentsDirectory: string,
  importModule: ModuleImporter
): Promise<EnumeratedComponent[]> {
  const files = readdirSync(componentsDirectory).filter(isTemplateFile).sort();

  const resolver = new DeclarationResolver(componentsDirectory);
  const out: EnumeratedComponent[] = [];
  for (const file of files) {
    const mod = (await importModule(
      resolve(componentsDirectory, file)
    )) as Record<string, unknown>;
    const template = mod.default as
      | {
          children?: unknown;
          name?: string;
          description?: unknown;
          props?: Record<string, PropDefinition>;
          extensions?: unknown;
          rest?: { tag?: unknown };
        }
      | undefined;
    if (!template || typeof template !== 'object') continue;
    const slots = {
      default: false,
      defaultScoped: false,
      named: new Set<string>(),
      scopeRequired: new Set<string>(),
    };
    collectSlots(template.children, slots);
    out.push({
      name: template.name ?? componentNameFromFile(file),
      file,
      template: template as Template,
      ...(typeof template.description === 'string'
        ? { description: template.description }
        : {}),
      props: withResolvedTypes(
        withBranchProps(template.props ?? {}, template.children),
        resolve(componentsDirectory, file),
        templateImports(template.extensions),
        resolver
      ),
      hasDefaultSlot: slots.default,
      ...(slots.defaultScoped ? { defaultSlotScoped: true } : {}),
      slotNames: [...slots.named],
      ...(slots.scopeRequired.size > 0
        ? { scopeRequiredSlots: [...slots.scopeRequired] }
        : {}),
      ...(hasPassthrough(template.children) ? { passthrough: true } : {}),
      ...(typeof template.rest?.tag === 'string'
        ? { rest: { tag: template.rest.tag } }
        : {}),
    });
  }
  return out;
}
