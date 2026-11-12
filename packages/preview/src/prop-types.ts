// Map one component prop → a control spec for the host's controls panel. Pure
// function of the prop (name, parsed type, default) plus the kit's control
// hints (its token-config hook - see PreviewControlHints).

import { parseType } from './lib/parse-type.js';
import type {
  PreviewControlHints,
  PropTypeSpecification,
  JsonValue,
} from './lib/types.js';

function isColorProp(name: string): boolean {
  return name === 'color' || /color$/i.test(name);
}

/** Whether the kit gives color tokens for a color select to offer. */
function hasColorTokens(hints: PreviewControlHints): boolean {
  return (hints.colorTokens ?? []).some((token) => token != null);
}

/** A union of string literals, template literal types (`` `accent-${string}` ``),
 *  `string`, or named types - the shapes a color-token type takes, which the
 *  color select can offer from the kit's token list whatever they expand to. */
const NON_STRING_KEYWORDS = new Set([
  'boolean',
  'number',
  'bigint',
  'object',
  'symbol',
  'unknown',
  'any',
  'never',
  'null',
  'void',
]);

function isStringLikeType(type: string): boolean {
  return type
    .split('|')
    .map((part) => part.trim())
    .every(
      (part) =>
        part === 'string' ||
        part === 'undefined' ||
        /^'[^']*'$/.test(part) ||
        /^"[^"]*"$/.test(part) ||
        /^`[^`]*`$/.test(part) ||
        (!NON_STRING_KEYWORDS.has(part) &&
          /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(part))
    );
}

/**
 * The control a prop gets in the controls panel, from its declared type. A
 * prop whose name ends in `color`, in any case (`color`, `borderColor`), and
 * whose type is string-like gets the
 * color select, offering the kit's color tokens, when the kit gives any;
 * otherwise it is treated by its declared type like any other prop.
 *
 * @param componentName - The component the prop belongs to.
 * @param propName - The prop's name.
 * @param def - The prop's declared type, resolved type and default.
 * @param hints - The kit's control hints; their `colorTokens` turn on the
 *   color select.
 * @returns The prop's control specification.
 */
export function propTypeForProp(
  componentName: string,
  propName: string,
  def: { type: string; resolvedType?: string; default?: JsonValue },
  hints: PreviewControlHints = {}
): PropTypeSpecification {
  const parsed = parseType(def.resolvedType ?? def.type);
  const hasDefault = def.default !== undefined;

  if (
    hasColorTokens(hints) &&
    isColorProp(propName) &&
    (parsed.kind === 'string' ||
      (parsed.kind === 'enum' &&
        parsed.options.every((option) => typeof option === 'string')) ||
      isStringLikeType(def.type))
  ) {
    return { name: propName, control: 'color-select', include: true };
  }

  switch (parsed.kind) {
    case 'boolean':
      return { name: propName, control: 'boolean', include: true };

    case 'number': {
      if (propName === 'size') {
        return {
          name: propName,
          control: 'number',
          number: { min: 0.25, max: 4, step: 0.05 },
          include: true,
        };
      }
      return { name: propName, control: 'number', include: true };
    }

    case 'enum': {
      const options: (string | boolean | undefined)[] = [...parsed.options];
      if (!hasDefault) options.unshift(undefined);
      return { name: propName, control: 'select', options, include: true };
    }

    case 'string':
    case 'stringOrNumber':
      return { name: propName, control: 'text', include: true };

    case 'complex':
      // Record<...>, X[], injected interfaces - driver-internal or too complex
      // for a control. Omit; a story file can supply a default prop if required.
      return { name: propName, control: 'text', include: false };
  }
}

/** Suggested default prop value from the template default (and the kit's
 *  component-size hint, when it supplies one). */
export function defaultPropForProp(
  componentName: string,
  propName: string,
  def: { type: string; default?: JsonValue },
  hints: PreviewControlHints
): JsonValue | undefined {
  if (def.default !== undefined) return def.default;
  if (propName === 'size' && parseType(def.type).kind === 'number') {
    return hints.componentSizeRem?.(componentName);
  }
  return undefined;
}
