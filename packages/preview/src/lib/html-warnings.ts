// What a story's html could not evaluate at rest, summarized for reading: a
// name that only the component's script defines, such as a per-instance id
// or its state, fails every expression that reads it, so a component that
// reads it in several places would otherwise repeat one warning per
// expression and bury the warnings that differ.

/** A warning as the render words it: `Name: could not evaluate expression (reason)`. */
const UNEVALUATED = /^(?:(.+?): )?could not evaluate ([\s\S]+)$/;

/**
 * Summarizes repeated html warnings: the warnings one component gives for
 * the same reason, such as `baseId is not defined`, become one line counting
 * the expressions, at the place of the first; a warning whose reason no other
 * warning of its component shares stays as it is, as does any warning that
 * is not an expression that could not be evaluated.
 *
 * @param warnings - The warnings, as the render gives them.
 * @returns The warnings, each kind of repeated warning once.
 * @example
 * ```ts
 * summarizeHtmlWarnings([
 *   "Tabs: could not evaluate baseId + '-list' (baseId is not defined)",
 *   "Tabs: could not evaluate baseId + '-panel' (baseId is not defined)",
 * ]);
 * // ['Tabs: could not evaluate 2 expressions (baseId is not defined)']
 * ```
 */
export function summarizeHtmlWarnings(warnings: readonly string[]): string[] {
  const groups = new Map<
    string,
    { component?: string; reason: string; warnings: string[] }
  >();
  const entries: Array<string | { key: string }> = [];
  for (const warning of warnings) {
    const parsed = parseWarning(warning);
    if (parsed === undefined) {
      entries.push(warning);
      continue;
    }
    const key = `${parsed.component ?? ''}\u0000${parsed.reason}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { ...parsed, warnings: [warning] });
      entries.push({ key });
    } else if (!group.warnings.includes(warning)) {
      group.warnings.push(warning);
    }
  }
  return entries.map((entry) => {
    if (typeof entry === 'string') return entry;
    const group = groups.get(entry.key)!;
    if (group.warnings.length === 1) return group.warnings[0];
    const prefix = group.component === undefined ? '' : `${group.component}: `;
    return `${prefix}could not evaluate ${group.warnings.length} expressions (${group.reason})`;
  });
}

/** A warning's component and the reason in its closing parentheses, which
 *  may hold parentheses of their own. */
function parseWarning(
  warning: string
): { component?: string; reason: string } | undefined {
  const match = UNEVALUATED.exec(warning);
  if (match === null || !warning.endsWith(')')) return undefined;
  let depth = 0;
  for (let index = warning.length - 1; index >= 0; index--) {
    const character = warning[index];
    if (character === ')') depth++;
    else if (character === '(') {
      depth--;
      if (depth === 0) {
        if (warning[index - 1] !== ' ') return undefined;
        const reason = warning.slice(index + 1, -1);
        return match[1] === undefined
          ? { reason }
          : { component: match[1], reason };
      }
    }
  }
  return undefined;
}
