// The root element of rendered markup: its tag, classes and inline custom
// properties.

import { decodeCharacterReferences } from './entities.js';

/** What {@link rootAttributes} reads from the root element. */
export interface RootAttributes {
  /** The root element's tag name, lowercased. */
  tag: string;
  /** The root element's classes. */
  classes: Set<string>;
  /** The custom properties its inline style declares, by name, each value
   *  trimmed with its runs of whitespace collapsed. A property declared twice
   *  keeps its last value. */
  variables: Record<string, string>;
}

/** How {@link rootAttributes} reads the root. */
export interface RootAttributesOptions {
  /** Read only the custom properties whose names start with this, such as
   *  `--kit-`. Every custom property by default. */
  variablePrefix?: string;
}

/**
 * Read the first element of rendered markup: its tag, its classes and the
 * custom properties of its inline style. What a target writes ahead of the
 * root is skipped: whitespace, comments (Vue's and Svelte's anchors) and the
 * `<link>` resource hints React hoists ahead of the markup for an image.
 *
 * @param markup - The rendered markup.
 * @param options - Which custom properties to read.
 * @returns The root's tag, classes and custom properties.
 * @throws When the markup holds no element.
 * @example
 * ```ts
 * rootAttributes('<!--[--><div class="Badge" style="--badge-size: 2rem">New</div>');
 * // { tag: 'div', classes: Set { 'Badge' }, variables: { '--badge-size': '2rem' } }
 * ```
 */
export function rootAttributes(
  markup: string,
  options: RootAttributesOptions = {}
): RootAttributes {
  const prefix = options.variablePrefix ?? '--';
  let rest = markup;
  for (;;) {
    rest = rest.replace(/^\s+/, '');
    if (rest.startsWith('<!--')) {
      const end = rest.indexOf('-->');
      if (end === -1) break;
      rest = rest.slice(end + 3);
    } else if (/^<link[\s/>]/i.test(rest)) {
      const end = rest.indexOf('>');
      if (end === -1) break;
      rest = rest.slice(end + 1);
    } else {
      break;
    }
  }
  const open = /^<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(rest);
  if (!open) {
    throw new Error(`No root element in: ${markup.slice(0, 120)}`);
  }
  const [, tag = '', attributeText = ''] = open;

  const classValue = attributeValue(attributeText, 'class') ?? '';
  const classes = new Set(classValue.split(/\s+/).filter(Boolean));

  const variables: Record<string, string> = {};
  for (const declaration of (
    attributeValue(attributeText, 'style') ?? ''
  ).split(';')) {
    const colon = declaration.indexOf(':');
    if (colon === -1) continue;
    const name = declaration.slice(0, colon).trim();
    if (!name.startsWith('--') || !name.startsWith(prefix)) continue;
    variables[name] = declaration
      .slice(colon + 1)
      .trim()
      .replace(/\s+/g, ' ');
  }

  return { tag: tag.toLowerCase(), classes, variables };
}

/** The decoded value of one attribute in an open tag's attribute text. */
function attributeValue(
  attributeText: string,
  name: string
): string | undefined {
  const match = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`,
    'i'
  ).exec(attributeText);
  if (!match) return undefined;
  return decodeCharacterReferences(match[1] ?? match[2] ?? match[3] ?? '');
}
