// A React body (a scoped fill's or a part's) is written where JSX takes one
// expression: an arrow's body, a `return (...)`. Content of two or more root
// nodes - two sibling elements, an element and text - is no expression there,
// and neither is text alone (`{name}` after `=>` reads as a block), so each
// goes in a fragment. Vue and Svelte bodies are markup, which takes them as
// they are. A plain scanner rather than a parser: the printed source also runs
// in the browser.

/** Words that stand before an operand, so a word after them is no text. */
const PREFIX_KEYWORDS = new Set(['typeof', 'void', 'new', 'await', 'delete']);

/** Words that stand between operands, so the words beside them are no text. */
const INFIX_KEYWORDS = new Set(['in', 'instanceof', 'as', 'satisfies']);

/**
 * A React body as one JSX expression: JSX content that is not one already in
 * a fragment, anything else as given.
 *
 * Content opening with a tag goes in a fragment when it has two or more root
 * nodes. Content opening with anything an expression cannot open with - a
 * `{name}` placeholder, punctuation - is text, and goes in one too. Content
 * opening as an expression can (a word, a number, a bracket, a quote) is an
 * expression (`row.name`, `open && <Badge />`) unless it reads as text: two
 * words side by side (`4 messages`), or a word followed by a placeholder or a
 * tag (`hello {name}`, `remove <Button />`). A body the scanner cannot read
 * through is left as given.
 *
 * @param body - The React body, as the fill gives it.
 * @returns The body, in `<>...</>` when it is not one JSX expression.
 * @example
 * singleJsxRoot('<Button label="keep" /><Button label="empty" />');
 * // '<><Button label="keep" /><Button label="empty" /></>'
 * singleJsxRoot('{name}');
 * // '<>{name}</>'
 */
export function singleJsxRoot(body: string): string {
  const trimmed = body.trim();
  if (trimmed === '') return body;
  if (trimmed.startsWith('<')) {
    const roots = countRoots(trimmed);
    return roots !== undefined && roots > 1 ? `<>${trimmed}</>` : body;
  }
  const opensExpression = /^[A-Za-z0-9_$([!+\-~.'"`]/.test(trimmed);
  return !opensExpression || readsAsText(trimmed) ? `<>${trimmed}</>` : body;
}

/** Whether content that opens as an expression can is text instead: two
 *  words side by side, or a word before a placeholder or a tag, outside
 *  brackets. */
function readsAsText(content: string): boolean {
  let depth = 0;
  // The word last read at the top level, while only whitespace follows it.
  let previousWord: string | undefined;
  let index = 0;
  while (index < content.length) {
    const character = content[index];
    if (character === '"' || character === "'" || character === '`') {
      const end = stringEnd(content, index);
      // A quote that never closes is an apostrophe in text.
      if (end === undefined) return true;
      index = end;
      previousWord = undefined;
      continue;
    }
    if (depth === 0) {
      const word = /^[A-Za-z0-9_$]+/.exec(content.slice(index))?.[0];
      if (word) {
        const spaced = index > 0 && /\s/.test(content[index - 1]);
        if (
          previousWord !== undefined &&
          spaced &&
          !PREFIX_KEYWORDS.has(previousWord) &&
          !INFIX_KEYWORDS.has(previousWord) &&
          !INFIX_KEYWORDS.has(word)
        )
          return true;
        previousWord = word;
        index += word.length;
        continue;
      }
      if (/\s/.test(character)) {
        index++;
        continue;
      }
      if (previousWord !== undefined && character === '{') return true;
      if (character === '<' && /[A-Za-z>]/.test(content[index + 1] ?? '')) {
        const elementClose = elementEnd(content, index);
        if (elementClose !== undefined) {
          // A tag after a word is text beside an element; after an operator
          // it is an operand, read past whole.
          if (previousWord !== undefined) return true;
          index = elementClose;
          continue;
        }
      }
      // A word joined to what follows by punctuation (`row.name`) is one
      // expression, not text.
      previousWord = undefined;
    }
    if (character === '(' || character === '[' || character === '{') depth++;
    else if (character === ')' || character === ']' || character === '}')
      depth--;
    index++;
  }
  return false;
}

/** The root nodes of JSX content, or `undefined` when it does not read through. */
function countRoots(content: string): number | undefined {
  let roots = 0;
  let index = 0;
  while (index < content.length) {
    const character = content[index];
    if (/\s/.test(character)) {
      index++;
      continue;
    }
    const end =
      character === '<'
        ? elementEnd(content, index)
        : character === '{'
          ? braceEnd(content, index)
          : textEnd(content, index);
    if (end === undefined) return undefined;
    roots++;
    index = end;
  }
  return roots;
}

/** The index past a run of text, at the next tag or expression. */
function textEnd(content: string, start: number): number {
  let index = start;
  while (
    index < content.length &&
    content[index] !== '<' &&
    content[index] !== '{'
  )
    index++;
  return index;
}

/** The index past the element (or fragment) that opens at `start`. */
function elementEnd(content: string, start: number): number | undefined {
  let depth = 0;
  let index = start;
  while (index < content.length) {
    const character = content[index];
    if (character === '{') {
      const end = braceEnd(content, index);
      if (end === undefined) return undefined;
      index = end;
      continue;
    }
    if (character !== '<') {
      index++;
      continue;
    }
    const closing = content[index + 1] === '/';
    const end = tagEnd(content, index);
    if (end === undefined) return undefined;
    const selfClosing = !closing && content[end - 2] === '/';
    if (closing) depth--;
    else if (!selfClosing) depth++;
    index = end;
    if (depth === 0) return index;
    if (depth < 0) return undefined;
  }
  return undefined;
}

/** The index past a tag's `>`, its attribute strings and expressions skipped. */
function tagEnd(content: string, start: number): number | undefined {
  let index = start + 1;
  while (index < content.length) {
    const character = content[index];
    if (character === '>') return index + 1;
    if (character === '"' || character === "'") {
      const end = content.indexOf(character, index + 1);
      if (end === -1) return undefined;
      index = end + 1;
      continue;
    }
    if (character === '{') {
      const end = braceEnd(content, index);
      if (end === undefined) return undefined;
      index = end;
      continue;
    }
    index++;
  }
  return undefined;
}

/** The index past the `}` that balances the `{` at `start`, strings skipped. */
function braceEnd(content: string, start: number): number | undefined {
  let depth = 0;
  let index = start;
  while (index < content.length) {
    const character = content[index];
    if (character === '"' || character === "'" || character === '`') {
      const end = stringEnd(content, index);
      if (end === undefined) return undefined;
      index = end;
      continue;
    }
    if (character === '{') depth++;
    else if (character === '}') {
      depth--;
      if (depth === 0) return index + 1;
    }
    index++;
  }
  return undefined;
}

/** The index past a string literal opening at `start`, escapes and a template's
 *  `${...}` skipped. */
function stringEnd(content: string, start: number): number | undefined {
  const quote = content[start];
  let index = start + 1;
  while (index < content.length) {
    const character = content[index];
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === quote) return index + 1;
    if (quote === '`' && character === '$' && content[index + 1] === '{') {
      const end = braceEnd(content, index + 1);
      if (end === undefined) return undefined;
      index = end;
      continue;
    }
    index++;
  }
  return undefined;
}
