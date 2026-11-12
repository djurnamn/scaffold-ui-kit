// Pin our deterministic id algorithm (lowercase, non-alphanumerics → '-',
// collapse, trim). Component ids are derived from the title via `sanitize`; the
// host manifest and the per-target registries key off the same value, so a
// drift here would desync nav ↔ render lookup across the iframe panes.
import { describe, expect, it } from 'vitest';
import { sanitize, storyId } from '../src/lib/naming';

describe('sanitize (component id)', () => {
  const cases: [title: string, id: string][] = [
    ['Components/Badge', 'components-badge'],
    ['Components/Overlay/Tooltip', 'components-overlay-tooltip'],
    ['Components/Overlay/Popout', 'components-overlay-popout'],
    ['Foundations/Tokens', 'foundations-tokens'],
  ];
  it.each(cases)('%s → %s', (title, id) => {
    expect(sanitize(title)).toBe(id);
  });
});

describe('storyId', () => {
  it('joins sanitized title and export name with --', () => {
    expect(storyId('Components/Overlay/Tooltip', 'Playground')).toBe(
      'components-overlay-tooltip--playground',
    );
  });
});
