// Rendered markup reduced to what every target agrees on, so the markup of
// one component in React, Vue and Svelte compares equal when it renders the
// same document.

import { decodeCharacterReferences } from './entities.js';

/** HTML elements that never have a closing tag. */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** Elements whose content is raw text, never markup, compared as written. */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);

/** Elements whose content is text, never markup, with character references
 *  decoded and its whitespace kept. */
const ESCAPABLE_RAW_TEXT_ELEMENTS = new Set(['textarea', 'title']);

/** A run of the whitespace HTML collapses; a no-break space is not one. */
const ASCII_WHITESPACE = /[ \t\n\r\f]+/g;

/** Text written back with the characters that would read as markup escaped. */
function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** An attribute value written back between double quotes. */
function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** The token every generated identifier becomes. */
export const GENERATED_IDENTIFIER = 'GENERATED';

/**
 * Numeric parts after a generated id, such as a kit's item index (`-0`). Vue's
 * nested ids (`v-1-0`) cannot be told from Vue's `v-1` with an index after it,
 * so every target's id takes them in, and `_r_1_-0`, `v-1-0` and `s1-0` read
 * alike.
 */
const NUMERIC_PARTS = '(?:-\\d+)*';

/**
 * Replace the identifiers a framework's own id generator writes with
 * {@link GENERATED_IDENTIFIER}: React's `useId` (`_R_0_`, `«R1l7»`, `«r0»`,
 * `:r0:`), Vue's `useId` (`v-0`, `v-0-1`) and Svelte's `$props.id()` (`s1` on
 * the server, `c1` on the client), each with any numeric parts after it.
 * Every occurrence of an id becomes the same token, so an element and the
 * attributes that point at it still agree.
 */
function replaceGeneratedIdentifiers(value: string): string {
  return value
    .replace(
      new RegExp(
        `(?:_[rR]_[0-9a-zA-Z]*_|«[0-9a-zA-Z]*»|:[rR][0-9a-zA-Z]*:)${NUMERIC_PARTS}`,
        'g'
      ),
      GENERATED_IDENTIFIER
    )
    .replace(
      new RegExp(`(^|[^0-9a-z])v-\\d+${NUMERIC_PARTS}(?![0-9a-z])`, 'gi'),
      `$1${GENERATED_IDENTIFIER}`
    )
    .replace(
      new RegExp(`(^|[^0-9a-z])[sc]\\d+${NUMERIC_PARTS}(?![0-9a-z])`, 'g'),
      `$1${GENERATED_IDENTIFIER}`
    );
}

/** Attributes whose value is an id, or a list of ids. */
const ID_ATTRIBUTES = new Set([
  'id',
  'for',
  'form',
  'list',
  'name',
  'headers',
  'itemref',
  'popovertarget',
  'commandfor',
  'aria-activedescendant',
  'aria-controls',
  'aria-describedby',
  'aria-details',
  'aria-errormessage',
  'aria-flowto',
  'aria-labelledby',
  'aria-owns',
  // Zag writes a machine's id into these.
  'data-uid',
  'data-ownedby',
  'data-controls',
]);

/** SVG attributes that point at an element by `url(#id)`. */
const URL_REFERENCE_ATTRIBUTES = new Set([
  'clip-path',
  'fill',
  'filter',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'stroke',
]);

/**
 * Whether an attribute carries an id: an id or id list, a fragment link
 * (`href="#..."`), or an SVG `url(#...)` reference. Only these have their
 * generated identifiers replaced, so any other value compares as written.
 */
function carriesIdentifier(name: string, value: string): boolean {
  if (ID_ATTRIBUTES.has(name)) return true;
  if (name === 'href' || name === 'xlink:href') return value.startsWith('#');
  if (URL_REFERENCE_ATTRIBUTES.has(name)) return value.includes('url(#');
  return false;
}

/**
 * One inline style as `name:value;name:value`. Custom properties come first,
 * sorted by name, the last declaration of each kept; standard properties
 * follow in their own order, since a shorthand and its longhand resolve by
 * order.
 */
function canonicalStyle(declarations: string): string {
  const customProperties = new Map<string, string>();
  const standardProperties: string[] = [];
  for (const raw of declarations.split(';')) {
    const declaration = raw.trim();
    if (!declaration) continue;
    const colon = declaration.indexOf(':');
    if (colon === -1) {
      standardProperties.push(declaration.replace(ASCII_WHITESPACE, ' '));
      continue;
    }
    const name = declaration.slice(0, colon).trim();
    const value = declaration
      .slice(colon + 1)
      .trim()
      .replace(ASCII_WHITESPACE, ' ');
    if (name.startsWith('--')) customProperties.set(name, value);
    else standardProperties.push(`${name.toLowerCase()}:${value}`);
  }
  return [
    ...[...customProperties.keys()]
      .sort()
      .map((name) => `${name}:${customProperties.get(name)}`),
    ...standardProperties,
  ].join(';');
}

/** A class list as its sorted tokens, without Svelte's scoping classes. */
function canonicalClass(value: string): string {
  return value
    .split(/\s+/)
    .filter((token) => token && !/^svelte-[0-9a-z]+$/.test(token))
    .sort()
    .join(' ');
}

interface Attribute {
  name: string;
  value: string;
}

/** An open tag's attributes, names lowercased, a bare attribute empty-valued. */
function parseAttributes(attributeText: string): Attribute[] {
  const pattern =
    /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const attributes: Attribute[] = [];
  for (const match of attributeText.matchAll(pattern)) {
    attributes.push({
      name: (match[1] ?? '').toLowerCase(),
      value: decodeCharacterReferences(match[2] ?? match[3] ?? match[4] ?? ''),
    });
  }
  return attributes;
}

/** The canonical attributes of an open tag, or `undefined` for a tag that is
 *  dropped (a hoisted preload hint). */
function canonicalAttributes(
  tag: string,
  attributeText: string
): Attribute[] | undefined {
  const attributes = parseAttributes(attributeText);
  if (
    tag === 'link' &&
    attributes.some(({ name, value }) => name === 'rel' && value === 'preload')
  ) {
    return undefined;
  }
  return attributes
    .map(({ name, value }) => {
      if (name === 'class') return { name, value: canonicalClass(value) };
      if (name === 'style') return { name, value: canonicalStyle(value) };
      return carriesIdentifier(name, value)
        ? { name, value: replaceGeneratedIdentifiers(value) }
        : { name, value };
    })
    .filter(
      ({ name, value }) =>
        !((name === 'class' || name === 'style') && value === '') &&
        !(
          (name === 'onload' || name === 'onerror') &&
          value === 'this.__e=event'
        )
    )
    .sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0
    );
}

/** The index just past the `>` that ends the tag opening at `start`, outside
 *  any quoted value, or -1 when the tag does not end. */
function endOfTag(markup: string, start: number): number {
  let quote = '';
  for (let index = start + 1; index < markup.length; index += 1) {
    const character = markup[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index + 1;
    }
  }
  return -1;
}

/**
 * Reduce rendered markup to the shape every target agrees on. It smooths
 * what the frameworks write differently for the same document, and nothing
 * else:
 *
 * - Comments are dropped: Vue's fragment anchors (`<!--[-->`, `<!---->`),
 *   Svelte's hydration anchors (`<!--[0-->`, `<!--$s1-->`) and template
 *   comments, which Vue keeps in development builds and the others never write.
 * - The `<link rel="preload">` hints React hoists ahead of the markup for an
 *   image are dropped.
 * - Svelte's event replay attributes, `onload="this.__e=event"` and
 *   `onerror="this.__e=event"` on an element that listens for those events,
 *   are dropped; an attribute with any other value stays.
 * - Attributes are sorted by name, and names lowercased: Vue's server
 *   renderer writes `viewbox` for an SVG's `viewBox` when it merges the
 *   element's attributes with others, which an HTML parser reads back as
 *   `viewBox`.
 * - A bare attribute is an empty one: Vue writes `disabled` where React and
 *   Svelte write `disabled=""`.
 * - An empty `class` or `style` is dropped: Vue writes `style=""` for a style
 *   binding that sets nothing.
 * - Class tokens are sorted, and Svelte's scoping classes (`svelte-1x2y3z`)
 *   dropped: Vue's server renderer writes a bound class before the static one.
 * - Inline styles are written `name:value;name:value`, custom properties first
 *   and sorted: Svelte writes declarations as given with a space after each
 *   colon and appends its `style:` directives, React and Vue write them tight.
 * - The identifiers React's and Vue's `useId` and Svelte's `$props.id()` write
 *   become one token, {@link GENERATED_IDENTIFIER}, in the attributes that
 *   carry ids: `id`, `for`, `form`, `list`, `name`, `headers`, `itemref`,
 *   `popovertarget`, `commandfor`, the `aria-*` id references, Zag's
 *   `data-uid`, `data-ownedby` and `data-controls`, an `href` starting with
 *   `#` and an SVG `url(#...)` reference. Svelte's client ids (`c1`) count,
 *   and so do numeric parts after any of them: Vue's nested `v-1-0` cannot
 *   be told from `v-1` with a kit's index after it, so `_r_1_-0` reads as one
 *   id too.
 * - Character references are decoded, and written back the one way: React
 *   writes `&#x27;`, Vue `&#39;` and Svelte the apostrophe itself, and Svelte
 *   leaves a `>` in text unescaped.
 * - Each run of whitespace in text is one space: Vue's compiler condenses it.
 *   The content of a `<script>` or `<style>` is raw text and compared as
 *   written; a `<textarea>`'s or `<title>`'s is text, its whitespace kept.
 * - A void element's closing slash is dropped, and a self-closed element is
 *   written with its closing tag.
 *
 * Tags, nesting, every other attribute value, text and whitespace between
 * elements compare as rendered.
 *
 * @param markup - The rendered markup.
 * @returns The canonical markup.
 * @example
 * ```ts
 * canonicalMarkup('<!--[--><input disabled class="b a"><!--]-->');
 * // '<input class="a b" disabled="">'
 * ```
 */
export function canonicalMarkup(markup: string): string {
  return canonicalNodes(markup).join('');
}

/**
 * {@link canonicalMarkup} with one node per entry, so a failed equality
 * points at the node where two targets part.
 *
 * @param markup - The rendered markup.
 * @returns The canonical tags and texts, in document order.
 * @example
 * ```ts
 * expect(canonicalNodes(vue)).toEqual(canonicalNodes(react));
 * ```
 */
export function canonicalNodes(markup: string): string[] {
  const output: string[] = [];
  const openElements: string[] = [];
  let text = '';
  let index = 0;

  const flushText = () => {
    const collapsed = decodeCharacterReferences(text).replace(
      ASCII_WHITESPACE,
      ' '
    );
    if (collapsed) output.push(escapeText(collapsed));
    text = '';
  };

  while (index < markup.length) {
    const next = markup.indexOf('<', index);
    if (next === -1) {
      text += markup.slice(index);
      break;
    }
    text += markup.slice(index, next);

    if (markup.startsWith('<!--', next)) {
      const end = markup.indexOf('-->', next + 4);
      index = end === -1 ? markup.length : end + 3;
      continue;
    }
    if (markup.startsWith('<!', next) || markup.startsWith('<?', next)) {
      const end = markup.indexOf('>', next);
      index = end === -1 ? markup.length : end + 1;
      continue;
    }
    if (markup.startsWith('</', next)) {
      const end = markup.indexOf('>', next);
      if (end === -1) break;
      flushText();
      const tag = markup
        .slice(next + 2, end)
        .trim()
        .toLowerCase();
      index = end + 1;
      if (VOID_ELEMENTS.has(tag)) continue;
      const depth = openElements.lastIndexOf(tag);
      if (depth === -1) continue;
      while (openElements.length > depth) {
        output.push(`</${openElements.pop()}>`);
      }
      continue;
    }

    const end = endOfTag(markup, next);
    if (end === -1) {
      text += markup.slice(next);
      break;
    }
    index = end;
    const inner = markup.slice(next + 1, end - 1);
    const nameEnd = inner.search(/[\s/]/);
    const tag = (
      nameEnd === -1 ? inner : inner.slice(0, nameEnd)
    ).toLowerCase();
    let attributeText = nameEnd === -1 ? '' : inner.slice(nameEnd);
    const selfClosing = /\/\s*$/.test(attributeText);
    attributeText = attributeText.replace(/\/\s*$/, '');

    const attributes = canonicalAttributes(tag, attributeText);
    if (!attributes) continue;
    flushText();
    output.push(
      `<${tag}${attributes.map(({ name, value }) => ` ${name}="${escapeAttribute(value)}"`).join('')}>`
    );
    if (VOID_ELEMENTS.has(tag)) continue;
    if (selfClosing) {
      output.push(`</${tag}>`);
      continue;
    }
    if (RAW_TEXT_ELEMENTS.has(tag) || ESCAPABLE_RAW_TEXT_ELEMENTS.has(tag)) {
      // The content runs to the element's own closing tag, whatever it holds.
      const closing = new RegExp(`</${tag}[\\s>/]`, 'i');
      const found = closing.exec(markup.slice(index));
      const contentEnd = found ? index + found.index : markup.length;
      const content = markup.slice(index, contentEnd);
      if (content) {
        output.push(
          RAW_TEXT_ELEMENTS.has(tag)
            ? content
            : escapeText(decodeCharacterReferences(content))
        );
      }
      output.push(`</${tag}>`);
      const closeEnd = markup.indexOf('>', contentEnd);
      index = found && closeEnd !== -1 ? closeEnd + 1 : markup.length;
      continue;
    }
    openElements.push(tag);
  }

  flushText();
  while (openElements.length > 0) output.push(`</${openElements.pop()}>`);
  // Whitespace at the edges of the whole markup is not part of any element.
  const first = output[0];
  if (first !== undefined && !first.startsWith('<')) {
    output[0] = first.trimStart();
  }
  const lastIndex = output.length - 1;
  const last = output[lastIndex];
  if (last !== undefined && !last.startsWith('<')) {
    output[lastIndex] = last.trimEnd();
  }
  return output.filter((node) => node !== '');
}
