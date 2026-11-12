// What the html pane and the html code pane say about the expressions the
// story's html could not evaluate at rest: a count, and a hint that says what
// that means before listing them, one to a line.

/** The count the html's warnings show as: `1 warning`, `2 warnings`. */
export function htmlWarningsLabel(warnings: readonly string[]): string {
  return `${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`;
}

/** The hint over the count, in markdown: what the html leaves out, then
 *  each warning as code on a line of its own. */
export function htmlWarningsHint(warnings: readonly string[]): string {
  return [
    'The html leaves out what it cannot evaluate at rest, so the parts it decides show at a default or not at all:',
    '',
    ...warnings.map((warning) => `- \`${warning.replace(/`/g, "'")}\``),
  ].join('\n');
}
