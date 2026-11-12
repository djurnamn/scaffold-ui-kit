// Character references, decoded so one character compares equal however a
// serializer spells it.

const NAMED_REFERENCES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Decode the numeric character references and the named ones serializers
 * write (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, `&nbsp;`) in one pass,
 * so `&amp;amp;` decodes to `&amp;`. Any other named reference is kept.
 *
 * @param text - Markup text or an attribute value.
 * @returns The text with those references decoded.
 */
export function decodeCharacterReferences(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, body: string) => {
      if (body[0] === '#') {
        const hexadecimal = body[1] === 'x' || body[1] === 'X';
        const codePoint = Number.parseInt(
          body.slice(hexadecimal ? 2 : 1),
          hexadecimal ? 16 : 10
        );
        return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : whole;
      }
      return NAMED_REFERENCES[body.toLowerCase()] ?? whole;
    }
  );
}
