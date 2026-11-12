// Read a manual component's props from its React driver's props interface, so the
// preview cannot drift from the code. The read is syntactic - source files parsed,
// no program or type checker - so it costs milliseconds per component. It takes
// the own members of the interface or object type, or of each operand of an
// intersection that is one, resolving type aliases and interfaces declared in the
// same file or imported from another (a relative path, a tsconfig path, or the
// kit's own package name), re-exports included. It also reads a few type forms a
// driver uses to build on a template component's props:
//
// - `ComponentProps<typeof X>` (or `ComponentPropsWithRef`,
//   `ComponentPropsWithoutRef`), where `X` names one of the kit's template
//   components: that template's props, and `children` when it has a default slot;
// - `Omit<T, 'a' | 'b'>` over a readable `T`: `T`'s members without those names;
// - a generic type alias given arguments: its body with the arguments in place;
// - a conditional type that always holds (`T extends unknown ? A : never`, the
//   idiom that applies `A` to each member of a union): its true branch.
//
// Whatever stays opaque (a function, an object, a utility type over a native
// element) becomes a hidden prop the check lists, or contributes nothing.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { parseType } from './lib/parse-type.js';
import type {
  EnumeratedComponent,
  ManualComponentSpecification,
} from './lib/types.js';

/** The props read from one `propsFrom` interface. */
export interface PropsFromResult {
  props: EnumeratedComponent['props'];
  /** Whether the interface declares a non-function `children` (the default slot;
   *  a render-function `children` is a scoped slot instead). */
  hasChildren: boolean;
  /** Whether that default slot exposes values to its content (a scoped
   *  slot): a template component's whose default slot does, read through
   *  `ComponentProps<typeof X>`. */
  childrenScoped: boolean;
  /** Members whose type is not a control. */
  hiddenProps: string[];
  /** Every own member name, `children` included. */
  memberNames: string[];
}

/** Splits `'<file>#<InterfaceName>'`, failing on any other shape. */
function parseReference(reference: string): { file: string; name: string } {
  const [file, name, ...rest] = reference.split('#');
  if (!file || !name || rest.length > 0) {
    throw new Error(
      `propsFrom '${reference}' must be '<file relative to the kit root>#<InterfaceName>'`
    );
  }
  return { file, name };
}

/** A type declaration found by name: an interface or a type alias, in its file. */
type Declaration =
  | { kind: 'interface'; node: ts.InterfaceDeclaration; file: ts.SourceFile }
  | { kind: 'alias'; node: ts.TypeAliasDeclaration; file: ts.SourceFile };

/** A member with the file it was declared in, for reading its type's text; or
 *  a prop a template component declares, already in preview form. */
type LocatedMember =
  | { kind: 'member'; member: ts.TypeElement; file: ts.SourceFile }
  | {
      kind: 'template';
      name: string;
      definition: EnumeratedComponent['props'][string];
    }
  | { kind: 'template-children'; scoped: boolean };

/** A type argument bound to a generic alias's parameter, with the file and the
 *  bindings it is read in. */
interface BoundArgument {
  node: ts.TypeNode;
  file: ts.SourceFile;
  bindings: ReadonlyMap<string, BoundArgument>;
}

/** What a type is read against: the declarations, the template components a
 *  `ComponentProps<typeof X>` can name, the generic bindings in scope, and the
 *  declarations already on this path (a guard against a cycle). */
interface ReadContext {
  resolver: DeclarationResolver;
  templates: readonly EnumeratedComponent[];
  bindings: ReadonlyMap<string, BoundArgument>;
  seen: ReadonlySet<string>;
}

/** The React utility types that take a component's props from `typeof X`. */
const COMPONENT_PROPS_TYPES = new Set([
  'ComponentProps',
  'ComponentPropsWithRef',
  'ComponentPropsWithoutRef',
]);

/** Finds type declarations by name across a kit's source files, following
 *  imports and re-exports with TypeScript's module resolution and the kit's
 *  tsconfig. Parses each file once. */
export class DeclarationResolver {
  private readonly files = new Map<string, ts.SourceFile>();
  private readonly options: ts.CompilerOptions;

  constructor(kitRoot: string) {
    const configurationPath = ts.findConfigFile(kitRoot, ts.sys.fileExists);
    const parsed = configurationPath
      ? ts.parseJsonConfigFileContent(
          ts.readConfigFile(configurationPath, ts.sys.readFile).config,
          ts.sys,
          dirname(configurationPath)
        )
      : undefined;
    this.options = {
      ...(parsed?.options ?? {}),
      // Bundler resolution reads package `exports`, so a kit importing its own
      // package by name resolves to its source.
      moduleResolution:
        parsed?.options.moduleResolution ?? ts.ModuleResolutionKind.Bundler,
      module: parsed?.options.module ?? ts.ModuleKind.ESNext,
    };
  }

  /** Parses source that is not on disk, as if it were the file at `path`, so
   *  its imports resolve from there. Not cached. */
  virtual(path: string, text: string): ts.SourceFile {
    return ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
  }

  file(path: string): ts.SourceFile {
    let file = this.files.get(path);
    if (!file) {
      file = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );
      this.files.set(path, file);
    }
    return file;
  }

  private resolveModule(
    specifier: string,
    from: ts.SourceFile
  ): ts.SourceFile | undefined {
    const resolved = ts.resolveModuleName(
      specifier,
      from.fileName,
      this.options,
      ts.sys
    ).resolvedModule;
    return resolved && existsSync(resolved.resolvedFileName)
      ? this.file(resolved.resolvedFileName)
      : undefined;
  }

  /** The declaration `name` refers to inside `file`: declared there, or imported. */
  find(
    name: string,
    file: ts.SourceFile,
    seen: Set<string> = new Set()
  ): Declaration | undefined {
    const key = `${file.fileName}#${name}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    for (const statement of file.statements) {
      if (
        ts.isInterfaceDeclaration(statement) &&
        statement.name.text === name
      ) {
        return { kind: 'interface', node: statement, file };
      }
      if (
        ts.isTypeAliasDeclaration(statement) &&
        statement.name.text === name
      ) {
        return { kind: 'alias', node: statement, file };
      }
    }
    for (const statement of file.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const bindings = statement.importClause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) continue;
        for (const element of bindings.elements) {
          if (element.name.text !== name) continue;
          const target = this.resolveModule(
            statement.moduleSpecifier.text,
            file
          );
          return target
            ? this.findExport(
                (element.propertyName ?? element.name).text,
                target,
                seen
              )
            : undefined;
        }
      }
    }
    return undefined;
  }

  /** The declaration a module exports as `name`, through re-exports. */
  private findExport(
    name: string,
    file: ts.SourceFile,
    seen: Set<string>
  ): Declaration | undefined {
    const local = this.find(name, file, seen);
    if (local) return local;
    for (const statement of file.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier)
        continue;
      if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const clause = statement.exportClause;
      let exported: string | undefined;
      if (!clause) exported = name;
      else if (ts.isNamedExports(clause)) {
        const element = clause.elements.find(
          (candidate) => candidate.name.text === name
        );
        exported = element
          ? (element.propertyName ?? element.name).text
          : undefined;
      }
      if (exported === undefined) continue;
      const target = this.resolveModule(statement.moduleSpecifier.text, file);
      const found = target
        ? this.findExport(exported, target, seen)
        : undefined;
      if (found) return found;
    }
    return undefined;
  }
}

/**
 * Reads the own members of the interface (or object type alias, or intersection
 * of them) `propsFrom` names into preview prop definitions.
 *
 * @param reference - `'<file relative to the kit root>#<InterfaceName>'`
 * @param kitRoot - The kit root the file resolves against
 * @param templates - The kit's template components, which a
 *   `ComponentProps<typeof X>` in the type can name
 * @returns The props, the default-slot flag, and the hidden and member names
 */
export function readPropsFrom(
  reference: string,
  kitRoot: string,
  templates: readonly EnumeratedComponent[] = []
): PropsFromResult {
  const { file, name } = parseReference(reference);
  const path = resolve(kitRoot, file);
  if (!existsSync(path))
    throw new Error(`propsFrom '${reference}': no file at ${path}`);
  const resolver = new DeclarationResolver(kitRoot);
  const source = resolver.file(path);
  const declaration = resolver.find(name, source);
  const located = declaration
    ? membersOf(declaration, {
        resolver,
        templates,
        bindings: new Map(),
        seen: new Set(),
      })
    : undefined;
  if (!located) {
    throw new Error(
      `propsFrom '${reference}': no interface or object type named ${name} in ${file}`
    );
  }

  // Expands aliases one member at a time, so a union of aliases reads as the
  // union of their members; anything else keeps its source text.
  const typeText = (
    node: ts.TypeNode,
    file: ts.SourceFile,
    seen: Set<string> = new Set()
  ): string => {
    if (ts.isUnionTypeNode(node))
      return node.types
        .map((member) => typeText(member, file, seen))
        .join(' | ');
    if (ts.isParenthesizedTypeNode(node))
      return typeText(node.type, file, seen);
    if (
      ts.isTypeReferenceNode(node) &&
      ts.isIdentifier(node.typeName) &&
      !node.typeArguments
    ) {
      const found = resolver.find(node.typeName.text, file);
      const key = found ? `${found.file.fileName}#${node.typeName.text}` : '';
      if (found?.kind === 'alias' && !seen.has(key)) {
        return typeText(found.node.type, found.file, new Set([...seen, key]));
      }
    }
    return node.getText(file);
  };

  // Later operands of an intersection win a shared name, as the type would.
  const byName = new Map<string, LocatedMember>();
  for (const entry of located) {
    const memberName = locatedName(entry);
    if (memberName !== undefined) byName.set(memberName, entry);
  }

  const result: PropsFromResult = {
    props: {},
    hasChildren: false,
    childrenScoped: false,
    hiddenProps: [],
    memberNames: [],
  };
  for (const [memberName, entry] of byName) {
    if (entry.kind === 'template-children') {
      result.memberNames.push('children');
      result.hasChildren = true;
      result.childrenScoped = entry.scoped;
      continue;
    }
    if (entry.kind === 'template') {
      result.memberNames.push(memberName);
      result.props[memberName] = entry.definition;
      if (parseType(entry.definition.type).kind === 'complex')
        result.hiddenProps.push(memberName);
      continue;
    }
    const { member, file: memberFile } = entry;
    if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member))
      continue;
    result.memberNames.push(memberName);
    if (memberName === 'children') {
      const childrenType =
        ts.isPropertySignature(member) && member.type ? member.type : undefined;
      result.hasChildren =
        childrenType !== undefined && !ts.isFunctionTypeNode(childrenType);
      result.childrenScoped = false;
      continue;
    }
    // A method signature is a function prop: never a control.
    const type =
      ts.isPropertySignature(member) && member.type
        ? typeText(member.type, memberFile)
        : '(...) => unknown';
    result.props[memberName] = {
      type,
      ...(member.questionToken ? {} : { required: true }),
    };
    if (parseType(type).kind === 'complex') result.hiddenProps.push(memberName);
  }
  return result;
}

/** The name a located member declares, when it has a plain one. */
function locatedName(entry: LocatedMember): string | undefined {
  if (entry.kind === 'template') return entry.name;
  if (entry.kind === 'template-children') return 'children';
  const { name } = entry.member;
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name))
    ? name.text
    : undefined;
}

/** The members a declaration contributes: an interface's own members, an object
 *  type's, or each readable operand's of an intersection. `undefined` when the
 *  declaration holds no object type at all. */
function membersOf(
  declaration: Declaration,
  context: ReadContext
): LocatedMember[] | undefined {
  const key = `${declaration.file.fileName}#${declaration.node.name.text}`;
  if (context.seen.has(key)) return [];
  const inner = { ...context, seen: new Set([...context.seen, key]) };
  if (declaration.kind === 'interface') {
    return declaration.node.members.map((member) => ({
      kind: 'member' as const,
      member,
      file: declaration.file,
    }));
  }
  return typeMembers(declaration.node.type, declaration.file, inner);
}

/** The rightmost identifier of a type name: `ComponentProps` for both
 *  `ComponentProps` and `React.ComponentProps`. */
function simpleName(name: ts.EntityName): string {
  return ts.isIdentifier(name) ? name.text : name.right.text;
}

/** The string literals of `'a'` or `'a' | 'b'`, or `undefined` for anything else. */
function literalNames(
  node: ts.TypeNode,
  file: ts.SourceFile,
  context: ReadContext
): string[] | undefined {
  if (ts.isParenthesizedTypeNode(node))
    return literalNames(node.type, file, context);
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal))
    return [node.literal.text];
  if (ts.isUnionTypeNode(node)) {
    const parts = node.types.map((part) => literalNames(part, file, context));
    return parts.every((part) => part !== undefined)
      ? parts.flatMap((part) => part ?? [])
      : undefined;
  }
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const bound = context.bindings.get(node.typeName.text);
    if (bound)
      return literalNames(bound.node, bound.file, {
        ...context,
        bindings: bound.bindings,
      });
  }
  return undefined;
}

function typeMembers(
  node: ts.TypeNode,
  file: ts.SourceFile,
  context: ReadContext
): LocatedMember[] | undefined {
  if (ts.isParenthesizedTypeNode(node))
    return typeMembers(node.type, file, context);
  if (ts.isTypeLiteralNode(node))
    return node.members.map((member) => ({
      kind: 'member' as const,
      member,
      file,
    }));
  if (ts.isIntersectionTypeNode(node)) {
    // A utility type or anything else unreadable contributes nothing; the
    // intersection still reads when one operand is an object type.
    const parts = node.types.map((part) => typeMembers(part, file, context));
    return parts.some((part) => part !== undefined)
      ? parts.flatMap((part) => part ?? [])
      : undefined;
  }
  // A conditional that always holds is its true branch.
  if (ts.isConditionalTypeNode(node)) {
    const always =
      node.extendsType.kind === ts.SyntaxKind.UnknownKeyword ||
      node.extendsType.kind === ts.SyntaxKind.AnyKeyword;
    return always ? typeMembers(node.trueType, file, context) : undefined;
  }
  if (!ts.isTypeReferenceNode(node)) return undefined;
  const name = simpleName(node.typeName);
  const typeArguments = node.typeArguments ?? [];

  // A generic alias's parameter reads as the argument it was given.
  if (ts.isIdentifier(node.typeName)) {
    const bound = context.bindings.get(name);
    if (bound)
      return typeMembers(bound.node, bound.file, {
        ...context,
        bindings: bound.bindings,
      });
  }

  if (COMPONENT_PROPS_TYPES.has(name) && typeArguments.length === 1) {
    const [argument] = typeArguments;
    if (ts.isTypeQueryNode(argument)) {
      const component = simpleName(argument.exprName);
      const template = context.templates.find(
        (candidate) => candidate.name === component
      );
      if (!template) return undefined;
      return [
        ...Object.entries(template.props).map(([propName, definition]) => ({
          kind: 'template' as const,
          name: propName,
          definition,
        })),
        ...(template.hasDefaultSlot
          ? [
              {
                kind: 'template-children' as const,
                scoped: template.defaultSlotScoped === true,
              },
            ]
          : []),
      ];
    }
  }

  if (name === 'Omit' && typeArguments.length === 2) {
    const base = typeMembers(typeArguments[0], file, context);
    const omitted = literalNames(typeArguments[1], file, context);
    if (!base || !omitted) return undefined;
    return base.filter((entry) => {
      const entryName = locatedName(entry);
      return entryName === undefined || !omitted.includes(entryName);
    });
  }

  if (!ts.isIdentifier(node.typeName)) return undefined;
  const found = context.resolver.find(name, file);
  if (!found) return undefined;
  const parameters =
    found.kind === 'alias' ? (found.node.typeParameters ?? []) : [];
  if (parameters.length === 0 || typeArguments.length === 0)
    return membersOf(found, { ...context, bindings: new Map() });
  // A generic alias given arguments: its body, each parameter bound to the
  // argument in this position (read where the reference is).
  const bindings = new Map<string, BoundArgument>();
  parameters.forEach((parameter, index) => {
    const argument = typeArguments[index] ?? parameter.default;
    if (argument)
      bindings.set(parameter.name.text, {
        node: argument,
        file: typeArguments[index] ? file : found.file,
        bindings: typeArguments[index] ? context.bindings : new Map(),
      });
  });
  return membersOf(found, { ...context, bindings });
}

/** The keywords a type's text can name that are never a declaration. */
const TYPE_KEYWORDS = new Set([
  'string',
  'number',
  'boolean',
  'bigint',
  'symbol',
  'object',
  'unknown',
  'any',
  'never',
  'null',
  'undefined',
  'void',
  'true',
  'false',
]);

/**
 * A template prop's type with the named types it uses expanded, read through
 * the template's own import statements: an alias becomes its members (a
 * generic one with its arguments in place), an interface reads as an object
 * form, and a union is flattened. `undefined` when the type names nothing to
 * expand, or expands to the same text.
 *
 * @param type - The prop's type as the template writes it
 * @param templatePath - The template file, which its imports resolve from
 * @param imports - The template's import statements
 * @param resolver - The declaration resolver to read through
 * @returns The expanded type, or `undefined`
 * @example
 * // With `import type { StackAlign } from '@acme/kit/scripts';`
 * resolveNamedType('StackAlign', templatePath, imports, resolver);
 * // "'start' | 'center' | 'end'"
 */
export function resolveNamedType(
  type: string,
  templatePath: string,
  imports: readonly string[],
  resolver: DeclarationResolver
): string | undefined {
  const names = type.match(/[A-Za-z_$][\w$]*/g) ?? [];
  if (names.every((name) => TYPE_KEYWORDS.has(name))) return undefined;
  const marker = '__PreviewPropType';
  const source = resolver.virtual(
    templatePath,
    `${imports.join('\n')}\ntype ${marker} = ${type};\n`
  );
  const statement = source.statements.find(
    (candidate): candidate is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(candidate) && candidate.name.text === marker
  );
  if (!statement) return undefined;

  const expand = (
    node: ts.TypeNode,
    file: ts.SourceFile,
    bindings: ReadonlyMap<string, BoundArgument>,
    seen: ReadonlySet<string>
  ): string => {
    if (ts.isUnionTypeNode(node))
      return node.types
        .map((member) => expand(member, file, bindings, seen))
        .join(' | ');
    if (ts.isParenthesizedTypeNode(node) && ts.isUnionTypeNode(node.type))
      return expand(node.type, file, bindings, seen);
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
      const name = node.typeName.text;
      const bound = bindings.get(name);
      if (bound) return expand(bound.node, bound.file, bound.bindings, seen);
      const found = resolver.find(name, file);
      const key = found ? `${found.file.fileName}#${name}` : '';
      if (found && !seen.has(key)) {
        if (found.kind === 'interface') return '{}';
        const inner = new Map<string, BoundArgument>();
        (found.node.typeParameters ?? []).forEach((parameter, index) => {
          const argument = node.typeArguments?.[index];
          if (argument)
            inner.set(parameter.name.text, { node: argument, file, bindings });
          else if (parameter.default)
            inner.set(parameter.name.text, {
              node: parameter.default,
              file: found.file,
              bindings: new Map(),
            });
        });
        return expand(
          found.node.type,
          found.file,
          inner,
          new Set([...seen, key])
        );
      }
    }
    return node.getText(file);
  };

  const expanded = expand(statement.type, source, new Map(), new Set());
  return expanded === type ? undefined : expanded;
}

/**
 * Resolves a manual spec into an EnumeratedComponent, reading `propsFrom` when set.
 *
 * @param specification - The manual component's specification
 * @param kitRoot - The kit root `propsFrom` resolves against
 * @param templates - The kit's template components, which a
 *   `ComponentProps<typeof X>` in the props type can name
 * @returns The component, with its props read from `propsFrom` or given inline
 */
export function resolveManualComponent(
  specification: ManualComponentSpecification,
  kitRoot: string,
  templates: readonly EnumeratedComponent[] = []
): EnumeratedComponent {
  const { propsFrom, ...rest } = specification;
  if (propsFrom !== undefined && specification.props !== undefined) {
    throw new Error(
      `[preview] manual component ${specification.name}: give props or propsFrom, not both`
    );
  }
  if (propsFrom === undefined) {
    return {
      ...rest,
      props: specification.props ?? {},
      hasDefaultSlot: specification.hasDefaultSlot ?? false,
      slotNames: specification.slotNames ?? [],
    };
  }
  let read: PropsFromResult;
  try {
    read = readPropsFrom(propsFrom, kitRoot, templates);
  } catch (error) {
    throw new Error(
      `[preview] manual component ${specification.name}: ${(error as Error).message}`,
      { cause: error }
    );
  }
  return {
    ...rest,
    props: read.props,
    hasDefaultSlot: specification.hasDefaultSlot ?? read.hasChildren,
    ...((specification.defaultSlotScoped ?? read.childrenScoped)
      ? { defaultSlotScoped: true }
      : {}),
    slotNames: specification.slotNames ?? [],
    hiddenProps: read.hiddenProps,
    memberNames: read.memberNames,
  };
}
