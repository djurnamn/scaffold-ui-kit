/** A nested style object, as a template's `styles` key takes it. */
export type StyleObject = Record<string, unknown>;

/** The style of each member of an axis, keyed by member, and of `none`. */
export interface OneOfCases {
  /** The element carrying no member of the axis. */
  none?: StyleObject;
  [member: string]: StyleObject | undefined;
}

/**
 * Writes one rule per condition of an axis, so that no two rules overlap.
 *
 * An element's modifiers that set the same properties form an axis: an
 * ordered list, weakest first. `oneOf` takes the axis and one style object
 * per member, plus `none` for the element carrying no member, and returns
 * nested style keys that state each member's condition against the members
 * that beat it. Since the compiled rules never overlap, neither specificity
 * nor source order decides anything.
 *
 * A member is any selector suffix of the element: a modifier (`--dense`), a
 * pseudo-class (`:last-child`), an attribute (`[open]`). The keys are Sass:
 * `#{&}` writes the block's name into the guard, and each guard sits in
 * `:where()`, so every rule keeps its member's own specificity.
 *
 * A key inside a case that starts with `&` comes out as a key of its own,
 * joined to the case's selector, so `&` stays the block:
 *
 * - an element of the block (`&__title`) is reached as the member's child,
 *   `&--quiet > &__title`. A descendant join would also reach the same
 *   element of a copy of the block nested inside, which has its own members.
 *   An element further down states its path from the child,
 *   `'&__handle > &__grip'`.
 * - an element reached as a descendant takes a key that starts with `& `,
 *   `'& &__search'`, which comes out as `&--wide &__search`. It is for an
 *   element of this block that the block passes into a slot of a component
 *   it composes: the element is still the block's own, but a child path to
 *   it would spell out the composed component's markup. It never reaches an
 *   element of another block; style that component through its own props
 *   and modifiers.
 * - a pseudo-element or pseudo-class (`&::before`) is appended to the case's
 *   selector.
 * - a selector list (`&__a, &__b`) is joined one selector at a time; a comma
 *   inside parentheses is not a separator.
 *
 * Use one call per axis per block.
 *
 * @param axis - The members, weakest first.
 * @param cases - The style of each member, and of `none`. A member left out
 *   writes no rule.
 * @returns The style keys, to spread into the block's style object.
 * @throws When a case names a member that is not on the axis.
 *
 * @example
 * ```ts
 * ...oneOf(['--boxed', '--dense'], {
 *   none: { padding: '0' },
 *   '--boxed': { padding: '1rem 2rem' },
 *   '--dense': { padding: '0 1rem' },
 * })
 * // '&:where(:not(#{&}--boxed, #{&}--dense))': { padding: '0' }
 * // '&--boxed:where(:not(#{&}--dense))':        { padding: '1rem 2rem' }
 * // '&--dense':                                  { padding: '0 1rem' }
 * ```
 */
export function oneOf(
  axis: readonly string[],
  cases: OneOfCases
): Record<string, StyleObject> {
  for (const member of Object.keys(cases)) {
    if (member !== 'none' && !axis.includes(member)) {
      throw new Error(
        `oneOf: "${member}" is not on the axis [${axis.join(', ')}]`
      );
    }
  }

  const rules: Record<string, StyleObject> = {};
  const place = (selector: string, style: StyleObject) => {
    const own: StyleObject = {};
    for (const [key, value] of Object.entries(style)) {
      if (key.startsWith('&') && value !== null && typeof value === 'object') {
        rules[joinSelector(selector, key)] = value as StyleObject;
      } else {
        own[key] = value;
      }
    }
    if (Object.keys(own).length > 0) rules[selector] = own;
  };

  if (cases.none) place(`&${guard(axis)}`, cases.none);
  axis.forEach((member, index) => {
    const style = cases[member];
    if (style) place(`&${member}${guard(axis.slice(index + 1))}`, style);
  });
  return rules;
}

/** The `:where(:not(...))` guard excluding every member that beats a case. */
function guard(stronger: readonly string[]): string {
  return stronger.length > 0
    ? `:where(:not(${stronger.map((member) => `#{&}${member}`).join(', ')}))`
    : '';
}

/**
 * A nested key joined to its case's selector: an element of the block as the
 * case's child, anything else appended. Each selector of a list is joined on
 * its own.
 */
function joinSelector(selector: string, key: string): string {
  return key
    .split(/,\s*(?![^(]*\))/)
    .map((part) =>
      part.startsWith('&__')
        ? `${selector} > ${part}`
        : `${selector}${part.slice(1)}`
    )
    .join(', ');
}
