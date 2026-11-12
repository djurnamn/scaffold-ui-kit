// A description as the kit wrote it, in markdown: parsed into React elements
// and set in charcell's RichText, which gives its paragraphs, inline code,
// code blocks, lists and links charcell's cells. Raw html in the text is shown
// as text, never parsed, so a tag a description mentions without backticks
// cannot swallow what follows it. A code block scrolls rather than wraps.
import { compiler } from 'markdown-to-jsx/react';
import { RichText } from 'charcell/react/unlinked';
import { useMemo } from 'react';

export function Markdown({ text }: { text: string }) {
  const content = useMemo(
    () => compiler(text.trim(), { disableParsingRawHTML: true, forceBlock: true, wrapper: null }),
    [text],
  );
  return <RichText>{content}</RichText>;
}
