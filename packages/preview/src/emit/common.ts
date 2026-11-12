// Shared helpers used by every per-target emitter. The propTypes/props are
// identical across targets (same model); only imports, render syntax, and
// slot-fill translation differ - those live in the per-target emitters.

import type {
  PropTypeSpecification,
  JsonValue,
  SlotFill,
  ResolvedStory,
} from '../lib/types.js';

export function serialize(value: JsonValue): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(serialize).join(', ')}]`;
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'object') {
    const body = Object.entries(value)
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}: ${serialize(entryValue as JsonValue)}`
      )
      .join(', ');
    return `{ ${body} }`;
  }
  return String(value);
}

/**
 * Text as a Vue or Svelte template reads it back: `&` and `<` escaped, as
 * either would start a character reference or open a tag.
 *
 * @param value - The text as the story gives it.
 * @returns The text as markup.
 */
export function markupText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

/**
 * Whether a text has whitespace a template does not keep as written:
 * whitespace at an edge, a run of it or a line break, which a template
 * trims, collapses, or loses where the printed element breaks over lines.
 *
 * @param value - The text as the story gives it.
 * @returns Whether the text has to be printed as a string expression.
 */
export function hasFragileWhitespace(value: string): boolean {
  return /^\s|\s$|\s\s|[\t\n\r\f]/.test(value);
}

/**
 * Text as a Vue template reads it back: markup text with each `{{` held in
 * an interpolation of its own, so it does not open one.
 *
 * @param value - The text as the story gives it.
 * @returns The text as Vue template content.
 * @example
 * vueText('Type {{ name }} here');
 * // 'Type {{ "{{" }} name }} here'
 */
export function vueText(value: string): string {
  return markupText(value).replace(/\{\{/g, '{{ "{{" }}');
}

/**
 * Text as a printed Vue template keeps it: {@link vueText}, or one string
 * interpolation for a text with whitespace at an edge, a run of it or a
 * line break, which Vue condenses and a printed element's line breaks
 * replace.
 *
 * @param value - The text as the story gives it.
 * @returns The text as Vue template content.
 * @example
 * vueSourceText(' 1 ripburger');
 * // '{{ " 1 ripburger" }}'
 */
export function vueSourceText(value: string): string {
  if (hasFragileWhitespace(value)) {
    // A `}}` inside the string would close the interpolation.
    return `{{ ${JSON.stringify(value).replace(/\}\}/g, '}\\u007d')} }}`;
  }
  return vueText(value);
}

/**
 * The Vue template content before a junction, given the content joined onto
 * it: a trailing `{` before content starting with one is held in an
 * interpolation of its own, as the two would otherwise open one.
 *
 * @param before - The content before the junction.
 * @param next - The content joined onto it.
 * @returns The content before the junction, safe to join.
 * @example
 * vueJunction('Price: {', '{ amount }}');
 * // "Price: {{ '{' }}"
 */
export function vueJunction(before: string, next: string): string {
  return before.endsWith('{') && next.startsWith('{')
    ? `${before.slice(0, -1)}{{ '{' }}`
    : before;
}

/**
 * Vue template pieces joined into one, each junction separated by
 * {@link vueJunction}.
 *
 * @param pieces - The template content, in order.
 * @returns The joined content.
 */
export function joinVue(pieces: string[]): string {
  return pieces.reduce(
    (joined, piece) => (joined ? vueJunction(joined, piece) : joined) + piece,
    ''
  );
}

/**
 * Text as a Svelte template reads it back: markup text with each brace held
 * in an expression of its own, so none opens one. Svelte trims the whitespace
 * at the edges of an element's or a component's content and collapses a run
 * of it, so a text with whitespace at an edge, a run of it or a line break
 * is one string expression instead, which Svelte renders as it is.
 *
 * @param value - The text as the story gives it.
 * @returns The text as Svelte markup.
 * @example
 * svelteText('Price: {amount}');
 * // "Price: {'{'}amount{'}'}"
 * svelteText(' 1 ripburger');
 * // '{" 1 ripburger"}'
 */
export function svelteText(value: string): string {
  if (hasFragileWhitespace(value)) {
    return `{${JSON.stringify(value)}}`;
  }
  return markupText(value).replace(/[{}]/g, (brace) => `{'${brace}'}`);
}

/**
 * A value as a Vue template's bound attribute holds it, single-quoted:
 * the value's expression with `&` and `'` as character references, which
 * the template reads back as the characters, so neither ends the attribute
 * nor starts a reference of its own.
 *
 * @param value - The prop's value.
 * @returns The attribute's text, quotes included.
 * @example
 * vueBoundAttribute("Don't");
 * // `'"Don&#39;t"'`
 */
export function vueBoundAttribute(value: JsonValue): string {
  return `'${serialize(value).replace(/&/g, '&amp;').replace(/'/g, '&#39;')}'`;
}

export function needsColor(model: ResolvedStory): boolean {
  return model.propTypes.some(
    (propType) => propType.include && propType.control === 'color-select'
  );
}

function propTypeLine(specification: PropTypeSpecification): string {
  if (!specification.include)
    return `    ${specification.name}: { table: { disable: true } },`;
  switch (specification.control) {
    case 'color-select':
      return `    ${specification.name}: { control: 'select', options: colorOptions },`;
    case 'select':
      return `    ${specification.name}: { control: 'select', options: ${serialize(specification.options ?? [])} },`;
    case 'number':
      return specification.number
        ? `    ${specification.name}: { control: { type: 'number', min: ${specification.number.min}, max: ${specification.number.max}, step: ${specification.number.step} } },`
        : `    ${specification.name}: { control: 'number' },`;
    case 'boolean':
      return `    ${specification.name}: { control: 'boolean' },`;
    case 'text':
      return `    ${specification.name}: { control: 'text' },`;
  }
}

export function propTypesBody(model: ResolvedStory): string {
  return model.propTypes.map(propTypeLine).join('\n');
}

/** The effective default-slot fill: an explicit story file fill, or the `children`
 *  text prop for components that have a default slot and no story file fill. */
export type DefaultSlot =
  | SlotFill
  | { kind: 'propText'; prop: string }
  | undefined;

export function effectiveDefaultSlot(model: ResolvedStory): DefaultSlot {
  if (model.slots?.default) return model.slots.default;
  if (model.defaultProps.children !== undefined)
    return { kind: 'propText', prop: 'children' };
  return undefined;
}

export function namedSlots(model: ResolvedStory): Record<string, SlotFill> {
  return model.slots?.named ?? {};
}
