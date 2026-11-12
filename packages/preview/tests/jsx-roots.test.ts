// A React body (a scoped fill's or a part's) stands where JSX takes one
// expression, so content of two or more root nodes goes in a fragment.

import { describe, expect, it } from 'vitest';
import { singleJsxRoot } from '../src/lib/jsx-roots';

describe('singleJsxRoot', () => {
  it('wraps sibling elements in a fragment', () => {
    expect(singleJsxRoot('<A /><B />')).toBe('<><A /><B /></>');
  });

  it('wraps an element beside text or an expression', () => {
    expect(singleJsxRoot('<A /> and more')).toBe('<><A /> and more</>');
    expect(singleJsxRoot('<A />{label}')).toBe('<><A />{label}</>');
  });

  it('leaves one root as it is, however deep', () => {
    const body = '<List items={[1, 2]}><Item label="a > b" /><Item onClick={() => count > 1 && go("<")}>{`${name}}`}</Item></List>';
    expect(singleJsxRoot(body)).toBe(body);
    expect(singleJsxRoot('<><A /><B /></>')).toBe('<><A /><B /></>');
    expect(singleJsxRoot('  <A />\n')).toBe('  <A />\n');
  });

  it('leaves a body that is an expression already', () => {
    for (const body of [
      'row.name',
      'open && <Badge />',
      'count + 1',
      "label ?? 'none'",
      'items.map((item) => <Item key={item.id} label={item.name} />)',
      'typeof value',
      "'quoted'",
      'open ? <Badge label="on" /> : null',
    ])
      expect(singleJsxRoot(body)).toBe(body);
  });

  it('wraps text alone, a placeholder among it', () => {
    expect(singleJsxRoot('{name}')).toBe('<>{name}</>');
    expect(singleJsxRoot('{item.label} ({item.count})')).toBe('<>{item.label} ({item.count})</>');
    expect(singleJsxRoot('hello {name}')).toBe('<>hello {name}</>');
    expect(singleJsxRoot('4 messages in trash')).toBe('<>4 messages in trash</>');
    expect(singleJsxRoot("don't")).toBe("<>don't</>");
    expect(singleJsxRoot('& friends')).toBe('<>& friends</>');
  });

  it('wraps text and elements side by side, whichever comes first', () => {
    expect(singleJsxRoot('remove <Button label="all" />')).toBe('<>remove <Button label="all" /></>');
    expect(singleJsxRoot('{count} <Badge />')).toBe('<>{count} <Badge /></>');
    expect(singleJsxRoot('<Badge /> {count} left')).toBe('<><Badge /> {count} left</>');
  });

  it('wraps multi-line siblings', () => {
    expect(singleJsxRoot('<A>\n  x\n</A>\n<B />')).toBe('<><A>\n  x\n</A>\n<B /></>');
  });

  it('leaves content it cannot read through as given', () => {
    expect(singleJsxRoot('<A label="open')).toBe('<A label="open');
  });
});
