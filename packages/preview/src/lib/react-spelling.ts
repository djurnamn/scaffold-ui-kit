// How React takes the attributes a story gives a component. A story spells
// an attribute as HTML does, the form every other target takes as it is;
// React takes `class` as `className`, a `style` string as a style object and
// the attributes it renames by their React names (`tabindex` as `tabIndex`,
// `for` as `htmlFor`), unless the component declares a prop by that exact
// name. Browser-safe, with no imports of its own: the React pane, the React
// registry and the printed React source share it, and the names React gives
// the attributes it renames are handed in (the React extension's table).

import type { SlotFill } from './types.js';

/**
 * A plain-CSS `style` string's declarations, split at each `;` outside a
 * quoted string and outside parentheses, so a `url("data:...;base64,...")`
 * stays whole.
 *
 * @param css - The declarations as a `style` attribute holds them.
 * @returns Each declaration's text, as written.
 */
export function styleDeclarations(css: string): string[] {
  const declarations: string[] = [];
  let quote = '';
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const character = css[i];
    if (quote) {
      if (character === '\\') i++;
      else if (character === quote) quote = '';
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '(') depth++;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (character === ';' && depth === 0) {
      declarations.push(css.slice(start, i));
      start = i + 1;
    }
  }
  declarations.push(css.slice(start));
  return declarations;
}

/** A CSS property's name in a React style object: camel-cased, a vendor
 *  prefix capitalized (`WebkitLineClamp`) but for `-ms-` (`msOverflowStyle`),
 *  a custom property (`--gap`) as written. */
function stylePropertyName(property: string): string {
  if (property.startsWith('--')) return property;
  const unprefixed = property.startsWith('-ms-') ? property.slice(1) : property;
  return unprefixed.replace(/-([a-z])/g, (_, letter: string) =>
    letter.toUpperCase()
  );
}

/**
 * A plain-CSS `style` string as the properties of a React style object:
 * each property camel-cased (a vendor prefix capitalized, `-ms-` as `ms`), a
 * custom property (`--gap`) kept as written. A `;` inside a quoted string or
 * parentheses stays in its value. A React style object has no
 * `!important`, so a value marked with it is kept without the mark: the
 * browser would drop the whole declaration otherwise.
 *
 * @param css - The declarations, `;`-separated.
 * @returns The style object's properties, in their order.
 * @example
 * ```ts
 * styleProperties('padding-inline: 1ch; --gap: 2px'); // { paddingInline: '1ch', '--gap': '2px' }
 * ```
 */
export function styleProperties(css: string): Record<string, string> {
  const properties: Record<string, string> = {};
  for (const declaration of styleDeclarations(css)) {
    const colon = declaration.indexOf(':');
    if (colon === -1) continue;
    const property = declaration.slice(0, colon).trim();
    if (!property) continue;
    properties[stylePropertyName(property)] = declaration
      .slice(colon + 1)
      .trim()
      .replace(/\s*!\s*important$/i, '');
  }
  return properties;
}

/** Two classes given under both `class` and `className`, joined. */
function joinedClassName<Value>(
  previous: Value | Record<string, string> | undefined,
  next: Value
): Value | string {
  if (previous === undefined || previous === null || previous === '')
    return next;
  if (next === undefined || next === null || (next as unknown) === '')
    return previous as Value;
  return `${String(previous)} ${String(next)}`;
}

/**
 * A component's props as React takes them: `class` as `className`, a
 * `style` string as a style object, and each attribute React renames by its
 * React name, unless the component declares a prop by that exact name, which
 * it takes as it is. Any other prop passes unchanged. A story that gives both
 * `class` and `className` gets the two joined, in their order.
 *
 * @param props - The props, as the story gives them.
 * @param declares - Whether the component declares a prop of a name.
 * @param attributeNames - The React name of each attribute React renames,
 *   by its HTML name.
 * @returns The props, spelled as React takes them, in their order.
 * @example
 * ```ts
 * reactProps({ class: 'w-48', tabindex: 0 }, () => false, { tabindex: 'tabIndex' });
 * // { className: 'w-48', tabIndex: 0 }
 * ```
 */
export function reactProps<Value>(
  props: Record<string, Value>,
  declares: (name: string) => boolean,
  attributeNames: Readonly<Record<string, string>>
): Record<string, Value | Record<string, string> | string> {
  const spelled: Record<string, Value | Record<string, string> | string> = {};
  for (const [name, value] of Object.entries(props)) {
    if (declares(name)) spelled[name] = value;
    else if (name === 'class' || name === 'className')
      spelled.className = joinedClassName(spelled.className, value);
    else if (name === 'style' && typeof value === 'string')
      spelled.style = styleProperties(value);
    else
      spelled[
        Object.prototype.hasOwnProperty.call(attributeNames, name)
          ? attributeNames[name]
          : name
      ] = value;
  }
  return spelled;
}

/**
 * A slot fill as React takes it: each component's props in it spelled by
 * {@link reactProps}, and each attribute of an html element React renames by
 * its React name (`for` as `htmlFor`). An html element's `class` and `style`
 * stay as written, which the React emitters spell themselves, and opaque
 * bodies stay as they are.
 *
 * @param fill - The fill.
 * @param declares - Whether a component declares a prop of a name.
 * @param attributeNames - The React name of each attribute React renames.
 * @returns The fill, every component's attributes spelled as React takes them.
 */
export function reactFill<Fill extends SlotFill | undefined>(
  fill: Fill,
  declares: (component: string, name: string) => boolean,
  attributeNames: Readonly<Record<string, string>>
): Fill {
  return fill && (reactFillOf(fill, declares, attributeNames) as Fill);
}

/** An html element's attributes, each React renames by its React name
 *  (`for` as `htmlFor`), in their order. `class` and `style` stay as
 *  written: the React emitters spell those on an element themselves. */
function renamedAttributes<Value>(
  attributes: Record<string, Value>,
  attributeNames: Readonly<Record<string, string>>
): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [
      Object.prototype.hasOwnProperty.call(attributeNames, name)
        ? attributeNames[name]
        : name,
      value,
    ])
  );
}

function reactFillOf(
  fill: SlotFill,
  declares: (component: string, name: string) => boolean,
  attributeNames: Readonly<Record<string, string>>
): SlotFill {
  const spell = (child: SlotFill): SlotFill =>
    reactFillOf(child, declares, attributeNames);
  if (fill.kind === 'element')
    return {
      ...fill,
      ...(fill.props
        ? {
            props: reactProps(
              fill.props,
              (name) => declares(fill.component, name),
              attributeNames
            ),
          }
        : {}),
      ...(fill.slots
        ? {
            slots: Object.fromEntries(
              Object.entries(fill.slots).map(([slot, slotFill]) => [
                slot,
                spell(slotFill),
              ])
            ),
          }
        : {}),
      ...(fill.children ? { children: spell(fill.children) } : {}),
    };
  if (fill.kind === 'html')
    return {
      ...fill,
      ...(fill.props
        ? { props: renamedAttributes(fill.props, attributeNames) }
        : {}),
      ...(fill.children ? { children: spell(fill.children) } : {}),
    };
  if (fill.kind === 'fragment')
    return { ...fill, children: fill.children.map(spell) };
  return fill;
}

/**
 * The names a component declares that {@link reactProps} would otherwise
 * respell: `class`, `style` and the attributes React renames. A component
 * keeps these as they are in React.
 *
 * @param declared - The component's declared prop names.
 * @param attributeNames - The React name of each attribute React renames.
 * @returns Those of `declared` React would otherwise respell.
 */
export function declaredAttributes(
  declared: Iterable<string>,
  attributeNames: Readonly<Record<string, string>>
): string[] {
  return [...declared].filter(
    (name) =>
      name === 'class' ||
      name === 'style' ||
      Object.prototype.hasOwnProperty.call(attributeNames, name)
  );
}
