// Parse the TypeScript-like `type` string a template's prop definition
// carries into a structured kind the propType mapper can switch on.

export type ParsedType =
  | { kind: 'boolean' }
  | { kind: 'number' }
  | { kind: 'string' }
  | { kind: 'stringOrNumber' }
  | {
      kind: 'enum';
      /** The literals the select offers. */
      options: (string | boolean)[];
      /** Whether the type also takes any string (`string & {}` among its
       *  members), which a story file may set beside the literals. */
      open?: boolean;
      /** Whether the type also takes a structured value (an object, an
       *  array or a tuple among its members), which a story file may set
       *  beside the literals. */
      structural?: boolean;
    }
  | { kind: 'complex'; raw: string };

/**
 * Splits a type's text on its top-level `|`, leaving a `|` inside brackets,
 * braces, parentheses, angle brackets or a template literal alone.
 *
 * @param type - The type as written.
 * @returns Its union members, trimmed.
 */
export function unionMembers(type: string): string[] {
  const members: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let current = '';
  for (const character of type) {
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === "'" || character === '"' || character === '`') {
      quote = character;
    } else if ('([{<'.includes(character)) {
      depth += 1;
    } else if (')]}>'.includes(character)) {
      depth -= 1;
    } else if (character === '|' && depth === 0) {
      members.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  members.push(current.trim());
  return members.filter(Boolean);
}

/** A string literal in either quote style. */
const STRING_LITERAL = /^(['"])[^'"]*\1$/;

/** An open string member, `string & {}`: any string, the literals suggested. */
function isOpenString(member: string): boolean {
  return /^\(?\s*string\s*&\s*\{\s*\}\s*\)?$/.test(member);
}

/** A member with structure a select cannot offer but need not: an object, an
 *  array or tuple, or a read-only array (a responsive value's breakpoint form). */
function isStructural(member: string): boolean {
  return (
    member.startsWith('{') ||
    member.startsWith('[') ||
    member.endsWith('[]') ||
    member.startsWith('readonly ') ||
    /^(Readonly)?Array</.test(member)
  );
}

export function parseType(type: string): ParsedType {
  // An optional union (`'a' | 'b' | undefined`, `string | null`) is controlled as
  // its non-nullish members: the control's unset state already covers the rest.
  const parts = unionMembers(type).filter(
    (part) => part !== 'undefined' && part !== 'null'
  );
  const t = parts.join(' | ');
  if (t === 'boolean' || t === 'true | false' || t === 'false | true')
    return { kind: 'boolean' };
  if (t === 'number') return { kind: 'number' };
  if (t === 'string') return { kind: 'string' };

  // `string | number` (primitives only, any order)
  if (
    parts.length > 1 &&
    parts.every((part) => part === 'string' || part === 'number')
  ) {
    return { kind: 'stringOrNumber' };
  }

  // A union of string literals (either quote style, as a driver's source may
  // spell it), e.g. 'soft' | 'solid', is a select of them. So is one that also
  // takes any string (`string & {}`) or a structured form such as a responsive
  // value's breakpoint list: the select offers the literals, and a story file sets
  // the rest. Any other member - a plain `string`, `number`, `boolean` or `false`
  // the select could not offer, or a name left unresolved - keeps it complex.
  const literals = parts.filter((part) => STRING_LITERAL.test(part));
  if (
    literals.length > 0 &&
    parts.every(
      (part) =>
        STRING_LITERAL.test(part) || isOpenString(part) || isStructural(part)
    )
  ) {
    return {
      kind: 'enum',
      options: literals.map((part) => part.slice(1, -1)),
      ...(parts.some(isOpenString) ? { open: true } : {}),
      ...(parts.some(isStructural) ? { structural: true } : {}),
    };
  }

  // A finite union of string literals and booleans, e.g. boolean |
  // 'indeterminate', is a select of each: true, false, then the literals.
  const booleans: string[] = parts.filter(
    (part) => part === 'boolean' || part === 'true' || part === 'false'
  );
  if (
    literals.length > 0 &&
    booleans.length > 0 &&
    parts.every((part) => STRING_LITERAL.test(part) || booleans.includes(part))
  ) {
    const values = new Set<boolean>(
      booleans.flatMap((part) =>
        part === 'boolean' ? [true, false] : [part === 'true']
      )
    );
    return {
      kind: 'enum',
      options: [
        ...[true, false].filter((value) => values.has(value)),
        ...literals.map((part) => part.slice(1, -1)),
      ],
    };
  }

  // Record<...>, SomeInterface[], SelectOption[], opaque bags, etc.
  return { kind: 'complex', raw: t };
}
