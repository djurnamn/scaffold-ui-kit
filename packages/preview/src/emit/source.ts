// Print a story as the source a consumer would write: the component with its
// props and slot content, importing from the kit's package entry per target.
// The registry emitters (react.ts, vue.ts, svelte.ts) print what the preview
// mounts - one line per story, props spread from the controls; this prints the
// same story as readable, standalone code for a docs page.

import {
  reactFill,
  reactProps,
  styleProperties,
} from '../lib/react-spelling.js';
import { singleJsxRoot } from '../lib/jsx-roots.js';
import {
  hasFragileWhitespace,
  svelteText,
  vueJunction,
  vueSourceText,
} from './common.js';
import { collectParts, collectSlotComponents } from '../lib/slot-fill.js';
import type {
  JsonValue,
  PartFill,
  SlotFill,
  StoryAround,
  Target,
} from '../lib/types.js';

/**
 * A two-way prop the story gives, which the printed source binds to state of
 * its own so the component's changes come back: React holds it in `useState`
 * and passes the setter as `changeProp`, Vue binds it with `v-model` (bare
 * with `vueModel`) or `v-model:<prop>`, and Svelte with `bind:<prop>`.
 */
export interface SourceBinding {
  /** The two-way prop. */
  prop: string;
  /** The event prop called with each new value. Without one, React prints
   *  the prop's value alone, as it has no way to hear a change. */
  changeProp?: string;
  /** The prop the component's own value starts from when the two-way prop
   *  is not given, which the source leaves out while it gives the prop. */
  defaultProp?: string;
  /** Whether a Vue consumer binds the prop with a bare `v-model`. */
  vueModel?: boolean;
  /** The prop's type as the component declares it, which types the state
   *  where the value alone would read narrower. */
  declaredType?: string;
  /** Whether the component takes type parameters, so its prop's type is
   *  the consumer's to infer rather than to name. */
  generic?: boolean;
}

/** A story resolved for printing: its root component, props and slot content. */
export interface SourceStory {
  /** The root component's local name (its export name). */
  component: string;
  /** The props to print, already merged and filtered. */
  props: Record<string, JsonValue>;
  /** Default-slot content. */
  children?: SlotFill;
  /** Named-slot content, keyed by slot name. */
  named: Record<string, SlotFill>;
  /** The content beside the component, printed as its siblings: React holds
   *  them in a fragment, Vue's template and Svelte's markup list them. */
  around?: StoryAround;
  /** Import lines' modules per local component name, and the names the
   *  component declares that React would otherwise respell
   *  (`declaredAttributes`: `class`, `style`, an attribute React renames),
   *  which React takes as they are. */
  imports: Map<
    string,
    { module: string; exported: string; declaredAttributes?: string[] }
  >;
  /** The root component's two-way props, those given in `props` bound to
   *  state of the source's own. */
  bindings?: SourceBinding[];
  /** The mode the kit builds its Svelte target in, which the state a bound
   *  prop is held in follows: `$state` in runes mode, a plain `let` in
   *  legacy mode (the default). */
  svelteMode?: 'legacy' | 'runes';
  /** How React spells the HTML attributes it renames (`tabindex` as
   *  `tabIndex`), by their HTML names. A story spells a component's
   *  attributes as HTML does; React's source takes `class` as `className`,
   *  a `style` string as a style object and these by their React names,
   *  unless the component declares a prop by that name. Without it, only
   *  `class` and `style` are respelled. */
  reactAttributeNames?: Readonly<Record<string, string>>;
  /** The type names the kit's package entries export, each with the module
   *  it is imported from for this target: a bound prop's state is typed by
   *  its declared type where it names these and the language's own types
   *  alone, importing them. */
  exportedTypes?: ReadonlyMap<string, string>;
}

const INDENT = '  ';
/** An opening tag longer than this puts each attribute on its own line. */
const MAXIMUM_WIDTH = 80;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Escapes a JavaScript single-quoted string literal needs: a line break or
 *  other control character inside one is a syntax error, and U+2028/U+2029
 *  read as line breaks in some parsers. */
const STRING_ESCAPES: Record<string, string> = {
  '\\': '\\\\',
  "'": "\\'",
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

function stringLiteral(value: string): string {
  const escaped = value.replace(
    /[\\'\u0000-\u001f\u2028\u2029]/g,
    (character) =>
      STRING_ESCAPES[character] ??
      `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
  return `'${escaped}'`;
}

/** A JavaScript expression for a JSON value, with single-quoted strings. */
function expression(value: JsonValue): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return stringLiteral(value);
  if (Array.isArray(value)) return `[${value.map(expression).join(', ')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value).map(
      ([key, entry]) =>
        `${IDENTIFIER.test(key) ? key : expression(key)}: ${expression(entry)}`
    );
    return entries.length ? `{ ${entries.join(', ')} }` : '{}';
  }
  return String(value);
}

/** The narrowest a value is wrapped to, however deep its tag sits. */
const MINIMUM_VALUE_WIDTH = 40;

/**
 * A JavaScript expression for a JSON value, as {@link expression} writes it
 * while it fits in `width`; a longer array or object is broken over lines,
 * one element or entry to a line with a trailing comma, each element broken
 * in turn while it is still too long. An array of numbers, booleans or
 * `null` fills each line instead.
 */
function wrappedExpression(value: JsonValue, width: number): string {
  const single = expression(value);
  if (single.length <= width || typeof value !== 'object' || value === null)
    return single;
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  const inner = Math.max(width - INDENT.length, MINIMUM_VALUE_WIDTH);
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (element) =>
        element === null ||
        typeof element === 'number' ||
        typeof element === 'boolean'
    )
  ) {
    const lines: string[] = [];
    for (const element of value.map((element) => `${expression(element)},`)) {
      const last = lines.length - 1;
      if (last >= 0 && lines[last].length + 1 + element.length <= inner)
        lines[last] += ` ${element}`;
      else lines.push(element);
    }
    return [open, ...lines.map((line) => `${INDENT}${line}`), close].join('\n');
  }
  const items = Array.isArray(value)
    ? value.map((element) => wrappedExpression(element, inner))
    : Object.entries(value).map(([key, entry]) => {
        const name = IDENTIFIER.test(key) ? key : expression(key);
        return `${name}: ${wrappedExpression(entry, inner - name.length - 2)}`;
      });
  if (items.length === 0) return single;
  const body = items.map(
    (item) => `${INDENT}${item.replace(/\n/g, `\n${INDENT}`)},`
  );
  return [open, ...body, close].join('\n');
}

/**
 * The width a prop's value has on its own line under an opening tag at
 * `depth`: the line's width less the attribute's column and its name, and
 * never narrower than {@link MINIMUM_VALUE_WIDTH}.
 */
function valueWidth(attributeHead: string, depth: number): number {
  return Math.max(
    MAXIMUM_WIDTH - INDENT.length * (depth + 1) - attributeHead.length - 1,
    MINIMUM_VALUE_WIDTH
  );
}

/** A plain-CSS `style` string as a React style object. */
function styleObject(css: string): string {
  return expression(styleProperties(css));
}

/** How one target spells attributes, text, and slot content. */
interface Dialect {
  /** Whether a line break between two siblings reads as a space, as in
   *  Vue's and Svelte's templates, which collapse it to one; JSX drops the
   *  whitespace at a line's edges instead. */
  lineBreakIsSpace: boolean;
  /** Whether a line break between two elements or components reads as a
   *  space too, as in Svelte; Vue drops it. */
  elementBreakIsSpace: boolean;
  /** A prop as an attribute, its value wrapped for a tag at `depth`. */
  attribute(
    name: string,
    value: JsonValue,
    html: boolean,
    depth: number
  ): string;
  text(value: string): string;
  /** The line before a junction, given the content joined onto it, changed
   *  where the two would read together as something else. */
  junction(line: string, next: string): string;
  /** Named-slot content inside an element: lines, or attributes on the element (React). */
  namedSlot(
    slot: string,
    fill: SlotFill,
    depth: number
  ): { attributes?: string[]; lines?: string[] };
  raw(fill: Extract<SlotFill, { kind: 'raw' }>): string;
  /** A call to a part, as lines at `depth`. */
  part(fill: PartFill, depth: number): string[];
}

function attributeList(
  dialect: Dialect,
  props: Record<string, JsonValue> | undefined,
  html: boolean,
  depth: number,
  bound: ReadonlyMap<string, string[]> = new Map()
): string[] {
  return Object.entries(props ?? {}).flatMap(
    ([name, value]) =>
      bound.get(name) ?? [dialect.attribute(name, value, html, depth)]
  );
}

/** An opening tag's lines: attributes on one line, or one per line past the
 *  width or when an attribute spans lines itself (a React prop holding JSX),
 *  each of its lines indented under the tag. */
function openTag(
  pad: string,
  name: string,
  attributes: string[],
  selfClosing: boolean
): string[] {
  const close = selfClosing ? ' />' : '>';
  const spansLines = attributes.some((attribute) => attribute.includes('\n'));
  const single = `${pad}<${name}${attributes.length ? ` ${attributes.join(' ')}` : ''}${close}`;
  if (
    !spansLines &&
    (single.length <= MAXIMUM_WIDTH || attributes.length === 0)
  )
    return [single];
  return [
    `${pad}<${name}`,
    ...attributes.flatMap((attribute) =>
      attribute.split('\n').map((line) => `${pad}${INDENT}${line}`)
    ),
    `${pad}${selfClosing ? '/>' : '>'}`,
  ];
}

/** Lines for a slot fill at `depth`. */
function fillLines(dialect: Dialect, fill: SlotFill, depth: number): string[] {
  const pad = INDENT.repeat(depth);
  switch (fill.kind) {
    case 'text':
      return [`${pad}${dialect.text(fill.value)}`];
    case 'raw':
      return [`${pad}${dialect.raw(fill)}`];
    case 'part':
      return dialect.part(fill, depth);
    case 'scoped':
      // Scoped content belongs to a named slot; nested elsewhere it renders nothing.
      return [];
    case 'fragment':
      return fragmentLines(dialect, fill, depth);
    case 'html':
      return elementLines(
        dialect,
        fill.tag,
        attributeList(dialect, fill.props, true, depth),
        fill.children,
        {},
        depth
      );
    case 'element':
      return elementLines(
        dialect,
        fill.component,
        attributeList(dialect, fill.props, false, depth),
        fill.children,
        fill.slots ?? {},
        depth
      );
  }
}

/** A fragment's children, those of a fragment inside it in its place, and
 *  empty text and scoped content, which renders nothing there, left out. */
function flattenedChildren(fill: SlotFill): SlotFill[] {
  if (fill.kind === 'fragment') return fill.children.flatMap(flattenedChildren);
  if (fill.kind === 'scoped') return [];
  return fill.kind === 'text' && fill.value === '' ? [] : [fill];
}

/** Whether a sibling starts (`'start'`) or ends (`'end'`) with whitespace:
 *  text and raw content by their own, anything else never. */
function edgeSpace(
  dialect: Dialect,
  fill: SlotFill,
  edge: 'start' | 'end'
): boolean {
  const content =
    fill.kind === 'text'
      ? fill.value
      : fill.kind === 'raw'
        ? dialect.raw(fill)
        : undefined;
  if (content === undefined) return false;
  return edge === 'start' ? /^\s/.test(content) : /\s$/.test(content);
}

/**
 * Lines for a fragment's children at `depth`, one sibling after another,
 * printed so the whitespace between text and the siblings beside it reads as
 * the story gives it. Where the story has whitespace there, the text's edge
 * loses it for the line break, which Vue and Svelte read as a space, and
 * React keeps it as `{' '}`, as JSX drops whitespace at a line's edges.
 * Where it has none, the two share a line in Vue and Svelte (and two texts
 * in React), so no break adds a space. Whitespace alone between two
 * siblings is `{' '}` in React, and one space between them on one line in
 * Vue and Svelte.
 */
function fragmentLines(
  dialect: Dialect,
  fill: SlotFill,
  depth: number
): string[] {
  const pad = INDENT.repeat(depth);
  const children = flattenedChildren(fill);
  const lines: string[] = [];
  let glueNext = false;
  children.forEach((child, index) => {
    const previous = children[index - 1];
    const next = children[index + 1];
    let glue = glueNext;
    glueNext = false;
    // Siblings that touch share a line where a break would read as a space:
    // text or raw content beside anything in Vue and Svelte, two elements
    // or components in Svelte alone, and two texts in React.
    const flowing = (sibling: SlotFill): boolean =>
      sibling.kind === 'text' || sibling.kind === 'raw';
    if (
      previous !== undefined &&
      !glue &&
      !edgeSpace(dialect, previous, 'end') &&
      !edgeSpace(dialect, child, 'start') &&
      (dialect.lineBreakIsSpace
        ? flowing(previous) || flowing(child) || dialect.elementBreakIsSpace
        : previous.kind === 'text' && child.kind === 'text')
    )
      glue = true;
    let childLines: string[];
    if (child.kind === 'text') {
      const before = previous !== undefined && /^\s/.test(child.value);
      const after = next !== undefined && /\s$/.test(child.value);
      const trimmed = child.value.slice(
        before ? child.value.length - child.value.trimStart().length : 0,
        after ? child.value.trimEnd().length : child.value.length
      );
      if (trimmed === '' && (before || after)) {
        // Whitespace alone between siblings; at an edge, Vue and Svelte
        // drop it as they do whitespace at an element's edge.
        if (!dialect.lineBreakIsSpace) childLines = [`${pad}{' '}`];
        else if (previous !== undefined && next !== undefined) {
          childLines = [' '];
          glue = true;
          glueNext = true;
        } else childLines = [];
      } else if (dialect.lineBreakIsSpace) {
        childLines = [`${pad}${dialect.text(trimmed)}`];
      } else {
        const space = "{' '}";
        childLines = [
          `${pad}${before ? space : ''}${dialect.text(trimmed)}${after ? space : ''}`,
        ];
      }
    } else childLines = fillLines(dialect, child, depth);
    if (childLines.length === 0) return;
    if (glue && lines.length > 0) {
      const first = childLines[0] === ' ' ? ' ' : childLines[0].trimStart();
      const last = dialect.junction(lines.pop()!, first);
      lines.push(`${last}${first}`, ...childLines.slice(1));
    } else lines.push(...childLines);
  });
  return lines;
}

/** Lines for an element with default and named content. */
function elementLines(
  dialect: Dialect,
  name: string,
  attributes: string[],
  children: SlotFill | undefined,
  named: Record<string, SlotFill>,
  depth: number
): string[] {
  const pad = INDENT.repeat(depth);
  const allAttributes = [...attributes];
  const namedLines: string[] = [];
  // Scoped content for the default slot is printed as a scoped slot is: the
  // function child, `#default`, the `children` snippet.
  const scopedChildren = children?.kind === 'scoped' ? children : undefined;
  const slotEntries: Array<[string, SlotFill]> = [
    ...(scopedChildren
      ? [['default', scopedChildren] as [string, SlotFill]]
      : []),
    ...Object.entries(named),
  ];
  for (const [slot, fill] of slotEntries) {
    const rendered = dialect.namedSlot(slot, fill, depth + 1);
    allAttributes.push(...(rendered.attributes ?? []));
    namedLines.push(...(rendered.lines ?? []));
  }
  const childLines =
    children && !scopedChildren ? fillLines(dialect, children, depth + 1) : [];
  const content = [...childLines, ...namedLines];
  if (content.length === 0) return openTag(pad, name, allAttributes, true);
  const open = openTag(pad, name, allAttributes, false);
  // A lone text child stays on a one-line element's line.
  if (
    content.length === 1 &&
    namedLines.length === 0 &&
    children?.kind === 'text' &&
    open.length === 1
  ) {
    const line = `${open[0]}${content[0].trim()}</${name}>`;
    if (line.length <= MAXIMUM_WIDTH) return [line];
  }
  return [...open, ...content, `${pad}</${name}>`];
}

const react: Dialect = {
  lineBreakIsSpace: false,
  elementBreakIsSpace: false,
  attribute(name, value, html, depth) {
    const key = html && name === 'class' ? 'className' : name;
    if (html && name === 'style' && typeof value === 'string')
      return `style={${styleObject(value)}}`;
    if (value === true) return key;
    // A quoted JSX attribute reads `&` as a character reference.
    if (typeof value === 'string' && !/["\n&]/.test(value))
      return `${key}="${value}"`;
    return `${key}={${wrappedExpression(value, valueWidth(`${key}={`, depth))}}`;
  },
  // JSX reads braces and angle brackets as code, and `&` as a reference,
  // and drops whitespace at the edge of a line of text.
  text: (value) =>
    /[{}<>&]/.test(value) || hasFragileWhitespace(value)
      ? `{${expression(value)}}`
      : value,
  junction: (line) => line,
  namedSlot(slot, fill, depth) {
    if (fill.kind === 'scoped') {
      if (!fill.react) return {};
      const head =
        fill.reactScope === 'positional'
          ? `(${fill.parameters.join(', ')})`
          : `({ ${fill.parameters.join(', ')} })`;
      // Sibling roots or text are no arrow body until a fragment holds them.
      const content = singleJsxRoot(fill.react);
      const body = content.includes('\n') ? `(${content})` : content;
      // A render function named `children` reads as the element's child.
      if (fill.slot.react === 'children')
        return { lines: [`${INDENT.repeat(depth)}{${head} => ${body}}`] };
      return { attributes: [`${fill.slot.react}={${head} => ${body}}`] };
    }
    if (fill.kind === 'text')
      return { attributes: [react.attribute(slot, fill.value, false, depth)] };
    // A raw body in a React prop: sibling roots, or text, are one expression
    // in a fragment.
    if (fill.kind === 'raw') {
      if (fill.react.trim() === '') return {};
      const content = singleJsxRoot(fill.react);
      const body = content.includes('\n') ? `(${content})` : content;
      return { attributes: [`${slot}={${body}}`] };
    }
    // Content in a React prop: text alone is a string, one line stays on the
    // prop's line, and more becomes an indented block, its lines relative to
    // the prop so the tag can indent them; several siblings, or text beside
    // anything, are held in a fragment.
    const flattened = flattenedChildren(fill);
    if (flattened.length === 0) return {};
    if (flattened.length === 1 && flattened[0].kind === 'text')
      return {
        attributes: [react.attribute(slot, flattened[0].value, false, depth)],
      };
    const lines = fillLines(react, fill, 0);
    const siblings = flattened.length > 1;
    if (lines.length === 1)
      return {
        attributes: [
          siblings
            ? `${slot}={<>${lines[0].trim()}</>}`
            : `${slot}={${lines[0].trim()}}`,
        ],
      };
    const block = siblings
      ? ['<>', ...lines.map((line) => `${INDENT}${line}`), '</>']
      : lines;
    return {
      attributes: [
        [`${slot}={`, ...block.map((line) => `${INDENT}${line}`), '}'].join(
          '\n'
        ),
      ],
    };
  },
  raw: (fill) => fill.react,
  part: (fill, depth) => componentCall(react, fill, depth),
};

const vue: Dialect = {
  lineBreakIsSpace: true,
  elementBreakIsSpace: false,
  attribute(name, value, _html, depth) {
    if (value === true) return name;
    if (typeof value === 'string' && !/["\n]/.test(value))
      return `${name}="${value}"`;
    return `:${name}="${wrappedExpression(value, valueWidth(`:${name}="`, depth)).replace(/"/g, '&quot;')}"`;
  },
  text: vueSourceText,
  // A `{` before content starting with one would open an interpolation.
  junction: vueJunction,
  namedSlot(slot, fill, depth) {
    const pad = INDENT.repeat(depth);
    if (fill.kind === 'scoped') {
      return fill.vue
        ? {
            lines: [
              `${pad}<template #${fill.slot.vue}="{ ${fill.parameters.join(', ')} }">`,
              `${pad}${INDENT}${fill.vue}`,
              `${pad}</template>`,
            ],
          }
        : {};
    }
    return {
      lines: [
        `${pad}<template #${slot}>`,
        ...fillLines(vue, fill, depth + 1),
        `${pad}</template>`,
      ],
    };
  },
  raw: (fill) => fill.vue,
  part: (fill, depth) => componentCall(vue, fill, depth),
};

const svelte: Dialect = {
  lineBreakIsSpace: true,
  elementBreakIsSpace: true,
  attribute(name, value, _html, depth) {
    if (value === true) return name;
    if (typeof value === 'string' && !/["\n{}]/.test(value))
      return `${name}="${value}"`;
    return `${name}={${wrappedExpression(value, valueWidth(`${name}={`, depth))}}`;
  },
  text: svelteText,
  junction: (line) => line,
  namedSlot(slot, fill, depth) {
    const pad = INDENT.repeat(depth);
    if (fill.kind === 'scoped') {
      return fill.svelte
        ? {
            lines: [
              `${pad}{#snippet ${fill.slot.svelte}({ ${fill.parameters.join(', ')} })}`,
              `${pad}${INDENT}${fill.svelte}`,
              `${pad}{/snippet}`,
            ],
          }
        : {};
    }
    return {
      lines: [
        `${pad}{#snippet ${slot}()}`,
        ...fillLines(svelte, fill, depth + 1),
        `${pad}{/snippet}`,
      ],
    };
  },
  raw: (fill) => fill.svelte,
  part: (fill, depth) => [
    `${INDENT.repeat(depth)}{@render ${fill.name}(${expression(fill.props ?? {})})}`,
  ],
};

/** A part called as a component, in React and Vue. */
function componentCall(
  dialect: Dialect,
  fill: PartFill,
  depth: number
): string[] {
  return elementLines(
    dialect,
    fill.name,
    attributeList(dialect, fill.props, false, depth),
    undefined,
    {},
    depth
  );
}

/** The parts the story's content calls, each declared once. */
function partsOf(story: SourceStory): PartFill[] {
  return [
    ...collectParts([
      story.around?.before,
      story.children,
      ...Object.values(story.named),
      story.around?.after,
    ]).values(),
  ];
}

/** Whether the story has content beside its component. */
function hasAround(story: SourceStory): boolean {
  return (
    story.around?.before !== undefined || story.around?.after !== undefined
  );
}

/** The component's lines between the lines of the content beside it, at
 *  `depth`. */
function besideLines(
  dialect: Dialect,
  story: SourceStory,
  component: string[],
  depth: number
): string[] {
  const { before, after } = story.around ?? {};
  return [
    ...(before ? fillLines(dialect, before, depth) : []),
    ...component,
    ...(after ? fillLines(dialect, after, depth) : []),
  ];
}

/** A part's destructured props with their type: each parameter's own, or `any`. */
function typedParameters(part: PartFill): string {
  const types = part.parameters.map(
    (name) => `${name}: ${part.parameterTypes?.[name] ?? 'any'}`
  );
  return `{ ${part.parameters.join(', ')} }: { ${types.join('; ')} }`;
}

/** A body's lines at `depth`, each of its own lines indented. */
function bodyLines(body: string, depth: number): string[] {
  return body.split('\n').map((line) => `${INDENT.repeat(depth)}${line}`);
}

/** `import { A, B as C, type D } from 'module';` lines, one per module, in
 *  first-seen order: of every component the story names, or only of `only`,
 *  and of the exported types `types` names, each beside the components of its
 *  module or in an `import type` of its own. */
function importLines(
  story: SourceStory,
  only?: Set<string>,
  types: readonly string[] = []
): string[] {
  const byModule = new Map<string, { names: string[]; types: string[] }>();
  const entry = (module: string) => {
    const found = byModule.get(module) ?? { names: [], types: [] };
    byModule.set(module, found);
    return found;
  };
  for (const [local, { module, exported }] of story.imports) {
    if (only && !only.has(local)) continue;
    entry(module).names.push(
      exported === local ? local : `${exported} as ${local}`
    );
  }
  for (const type of types) {
    const module = story.exportedTypes?.get(type);
    if (module !== undefined) entry(module).types.push(type);
  }
  return [...byModule].map(([module, { names, types: typeNames }]) =>
    names.length === 0
      ? `import type { ${typeNames.join(', ')} } from '${module}';`
      : `import { ${[...names, ...typeNames.map((type) => `type ${type}`)].join(', ')} } from '${module}';`
  );
}

/** The words a type made of the language's own types alone is written in. */
const BUILT_IN_TYPE_WORDS =
  /\b(?:string|number|boolean|bigint|null|undefined|true|false|unknown|any|readonly|Array|ReadonlyArray)\b/g;

/**
 * The names a type uses beyond the language's own types and literals, when
 * each of them is one of `exported` (none for a type of the language's own
 * alone), so a consumer's file can write it as it stands, importing those;
 * `undefined` when it uses any other name or a shape written out in place.
 */
function writableTypeNames(
  type: string,
  exported: ReadonlyMap<string, string> = new Map()
): string[] | undefined {
  const names: string[] = [];
  const rest = type
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '')
    .replace(BUILT_IN_TYPE_WORDS, '')
    .replace(/[A-Za-z_$][\w$]*/g, (name) => {
      if (!exported.has(name)) return name;
      if (!names.includes(name)) names.push(name);
      return '';
    })
    .replace(/-?\d+(?:\.\d+)?/g, '');
  return /^[\s|&()[\]<>,]*$/.test(rest) ? names : undefined;
}

/** The type a JSON value is inferred as where state starts from it, when it
 *  is a primitive's: `boolean`, `number` or `string`. */
function inferredType(value: JsonValue): string | undefined {
  return ['boolean', 'number', 'string'].includes(typeof value)
    ? typeof value
    : undefined;
}

/**
 * The type argument the state holding a bound prop takes: none where the
 * value reads as the declared type, or as a primitive with no declared type;
 * the declared type where it names the language's own types alone; none for
 * or types the kit's package entry exports, importing those (`typeImports`);
 * none for a generic component, whose type parameters the value infers;
 * else the component's own prop type, as `propsType` names it
 * (`ComponentProps<typeof X>['open']`), so an array or `null` never starts
 * the state narrower than the prop.
 */
function stateType(
  binding: SourceBinding,
  value: JsonValue,
  propsType: (prop: string) => string,
  exportedTypes?: ReadonlyMap<string, string>
): { type?: string; propsLookup?: boolean; typeImports?: string[] } {
  const declared = binding.declaredType?.trim();
  const inferred = inferredType(value);
  if (declared ? declared === inferred : inferred !== undefined) return {};
  const named = declared
    ? writableTypeNames(declared, exportedTypes)
    : undefined;
  if (declared && named)
    return {
      type: declared,
      ...(named.length > 0 ? { typeImports: named } : {}),
    };
  if (binding.generic) return {};
  return { type: propsType(binding.prop), propsLookup: true };
}

/**
 * The story as its source prints it for a target: a prop given `null` left
 * out, as a scenario's `null` unsets it, unless the target binds it as a
 * two-way prop, whose state then starts from `null`; and the default prop of
 * each two-way prop the story gives left out, as the component's value
 * starts from the given prop instead.
 */
function printedStory(story: SourceStory, target: Target): SourceStory {
  const bound = new Set(boundOf(story, target).map((binding) => binding.prop));
  const props: Record<string, JsonValue> = {};
  for (const [name, value] of Object.entries(story.props))
    if (value !== null || bound.has(name)) props[name] = value;
  for (const binding of story.bindings ?? [])
    if (binding.defaultProp !== undefined && binding.prop in props)
      delete props[binding.defaultProp];
  // A name the story imports as a component is a value, never a type.
  const exportedTypes = story.exportedTypes
    ? new Map(
        [...story.exportedTypes].filter(([name]) => !story.imports.has(name))
      )
    : undefined;
  return { ...story, props, ...(exportedTypes ? { exportedTypes } : {}) };
}

/** The story's bindings this target binds: those for props the story gives,
 *  named as a variable can be, and in React those with a change prop. */
function boundOf(story: SourceStory, target: Target): SourceBinding[] {
  return (story.bindings ?? []).filter(
    (binding) =>
      binding.prop in story.props &&
      IDENTIFIER.test(binding.prop) &&
      (target !== 'react' ||
        (binding.changeProp !== undefined &&
          IDENTIFIER.test(binding.changeProp)))
  );
}

/** A setter's name for a state variable: `open` → `setOpen`. */
function setterName(name: string): string {
  return `set${name[0].toUpperCase()}${name.slice(1)}`;
}

/** The story as a React component module, the attributes it gives a
 *  component spelled as React takes them (see `reactAttributeNames`). */
export function reactSource(given: SourceStory): string {
  const printed = printedStory(given, 'react');
  const names = printed.reactAttributeNames ?? {};
  const declares = (component: string, name: string): boolean =>
    printed.imports.get(component)?.declaredAttributes?.includes(name) === true;
  const story: SourceStory = {
    ...printed,
    props: reactProps(
      printed.props,
      (name) => declares(printed.component, name),
      names
    ) as Record<string, JsonValue>,
    children: reactFill(printed.children, declares, names),
    named: Object.fromEntries(
      Object.entries(printed.named).map(([slot, fill]) => [
        slot,
        reactFill(fill, declares, names),
      ])
    ),
    ...(printed.around
      ? {
          around: {
            ...(printed.around.before
              ? { before: reactFill(printed.around.before, declares, names) }
              : {}),
            ...(printed.around.after
              ? { after: reactFill(printed.around.after, declares, names) }
              : {}),
          },
        }
      : {}),
  };
  // A bound prop's state, and its value and setter passed to the component.
  const bindings = boundOf(story, 'react');
  let propsLookup = false;
  const typeImports = new Set<string>();
  const states = bindings.map((binding) => {
    const value = story.props[binding.prop];
    const {
      type,
      propsLookup: looked,
      typeImports: named,
    } = stateType(
      binding,
      value,
      (prop) => `ComponentProps<typeof ${story.component}>['${prop}']`,
      story.exportedTypes
    );
    propsLookup ||= looked === true;
    for (const name of named ?? []) typeImports.add(name);
    return `${INDENT}const [${binding.prop}, ${setterName(binding.prop)}] = useState${type ? `<${type}>` : ''}(${expression(value)});`;
  });
  const bound = new Map(
    bindings.map((binding) => [
      binding.prop,
      [
        `${binding.prop}={${binding.prop}}`,
        `${binding.changeProp}={${setterName(binding.prop)}}`,
      ],
    ])
  );
  // Content beside the component is returned in a fragment with it.
  const beside = hasAround(story);
  const depth = beside ? 3 : 2;
  const component = elementLines(
    react,
    story.component,
    attributeList(react, story.props, false, depth, bound),
    story.children,
    story.named,
    depth
  );
  const pad = INDENT.repeat(2);
  const body = beside
    ? [`${pad}<>`, ...besideLines(react, story, component, depth), `${pad}</>`]
    : component;
  const returned =
    body.length === 1
      ? [`${INDENT}return ${body[0].trim()};`]
      : [`${INDENT}return (`, ...body, `${INDENT});`];
  // A part is a function component above the example.
  const parts = partsOf(story).flatMap((part) => [
    `function ${part.name}(${typedParameters(part)}) {`,
    `${INDENT}return (`,
    ...bodyLines(singleJsxRoot(part.react), 2),
    `${INDENT});`,
    '}',
    '',
  ]);
  return [
    ...(states.length
      ? [
          `import { useState${propsLookup ? ', type ComponentProps' : ''} } from 'react';`,
        ]
      : []),
    ...importLines(story, undefined, [...typeImports]),
    '',
    ...parts,
    `export function ${story.component}Example() {`,
    ...(states.length ? [...states, ''] : []),
    ...returned,
    '}',
    '',
  ].join('\n');
}

/** The story as a Vue single-file component. */
export function vueSource(given: SourceStory): string {
  const story = printedStory(given, 'vue');
  // A bound prop's ref, bound with `v-model`.
  const bindings = boundOf(story, 'vue');
  const typeImports = new Set<string>();
  const states = bindings.map((binding) => {
    const value = story.props[binding.prop];
    const { type, typeImports: named } = stateType(
      binding,
      value,
      (prop) => `InstanceType<typeof ${story.component}>['$props']['${prop}']`,
      story.exportedTypes
    );
    for (const name of named ?? []) typeImports.add(name);
    return `const ${binding.prop} = ref${type ? `<${type}>` : ''}(${expression(value)});`;
  });
  const bound = new Map(
    bindings.map((binding) => [
      binding.prop,
      [
        binding.vueModel
          ? `v-model="${binding.prop}"`
          : `v-model:${binding.prop}="${binding.prop}"`,
      ],
    ])
  );
  const body = besideLines(
    vue,
    story,
    elementLines(
      vue,
      story.component,
      attributeList(vue, story.props, false, 1, bound),
      story.children,
      story.named,
      1
    ),
    1
  );
  // A part is a single-file component of its own, printed after the story's
  // under a comment naming its file; each imports what it uses.
  const parts = partsOf(story);
  const used = new Set([story.component]);
  collectSlotComponents(story.children, used, false);
  for (const fill of [
    ...Object.values(story.named),
    story.around?.before,
    story.around?.after,
  ])
    collectSlotComponents(fill, used, false);
  return [
    '<script setup lang="ts">',
    ...(states.length ? ["import { ref } from 'vue';"] : []),
    ...importLines(story, used, [...typeImports]),
    ...parts.map((part) => `import ${part.name} from './${part.name}.vue';`),
    ...(states.length ? ['', ...states] : []),
    '</script>',
    '',
    '<template>',
    ...body,
    '</template>',
    '',
    ...parts.flatMap((part) => [
      `<!-- ${part.name}.vue -->`,
      '<script setup lang="ts">',
      ...importLines(story, new Set(part.imports)),
      ...(part.imports?.length ? [''] : []),
      part.parameterTypes
        ? `defineProps<{ ${part.parameters.map((name) => `${name}: ${part.parameterTypes?.[name] ?? 'any'}`).join('; ')} }>();`
        : `defineProps([${part.parameters.map((name) => stringLiteral(name)).join(', ')}]);`,
      '</script>',
      '',
      '<template>',
      ...bodyLines(part.vue, 1),
      '</template>',
      '',
    ]),
  ].join('\n');
}

/** The story as a Svelte component. */
export function svelteSource(given: SourceStory): string {
  const story = printedStory(given, 'svelte');
  // A bound prop's state, bound with `bind:`: `$state` in runes mode, a plain
  // `let` in legacy mode.
  const bindings = boundOf(story, 'svelte');
  const runes = story.svelteMode === 'runes';
  let propsLookup = false;
  const typeImports = new Set<string>();
  const states = bindings.map((binding) => {
    const value = story.props[binding.prop];
    const {
      type,
      propsLookup: looked,
      typeImports: named,
    } = stateType(
      binding,
      value,
      (prop) => `ComponentProps<typeof ${story.component}>['${prop}']`,
      story.exportedTypes
    );
    propsLookup ||= looked === true;
    for (const name of named ?? []) typeImports.add(name);
    return runes
      ? `${INDENT}let ${binding.prop} = $state${type ? `<${type}>` : ''}(${expression(value)});`
      : `${INDENT}let ${binding.prop}${type ? `: ${type}` : ''} = ${expression(value)};`;
  });
  const bound = new Map(
    bindings.map((binding) => [binding.prop, [`bind:${binding.prop}`]])
  );
  const body = besideLines(
    svelte,
    story,
    elementLines(
      svelte,
      story.component,
      attributeList(svelte, story.props, false, 0, bound),
      story.children,
      story.named,
      0
    ),
    0
  );
  // A part is a snippet at the top of the markup.
  const parts = partsOf(story).flatMap((part) => [
    `{#snippet ${part.name}(${typedParameters(part)})}`,
    ...bodyLines(part.svelte, 1),
    '{/snippet}',
    '',
  ]);
  return [
    '<script lang="ts">',
    ...(propsLookup
      ? [`${INDENT}import type { ComponentProps } from 'svelte';`]
      : []),
    ...importLines(story, undefined, [...typeImports]).map(
      (line) => `${INDENT}${line}`
    ),
    ...(states.length ? ['', ...states] : []),
    '</script>',
    '',
    ...parts,
    ...body,
    '',
  ].join('\n');
}

/**
 * A story's props in the order the component declares them, so the source
 * prints them alike however they were gathered (the template's defaults, the
 * story file's, a scenario's); a prop the component does not declare follows,
 * in the order given.
 *
 * @param props - The props to print.
 * @param declared - The component's prop names, in declaration order.
 * @returns The same props, reordered.
 */
export function inDeclarationOrder(
  props: Record<string, JsonValue>,
  declared: readonly string[]
): Record<string, JsonValue> {
  const ordered: Record<string, JsonValue> = {};
  for (const name of declared) if (name in props) ordered[name] = props[name];
  for (const [name, value] of Object.entries(props))
    if (!(name in ordered)) ordered[name] = value;
  return ordered;
}

/** The printer per target. */
export const SOURCE_PRINTERS: Record<Target, (story: SourceStory) => string> = {
  react: reactSource,
  vue: vueSource,
  svelte: svelteSource,
};
