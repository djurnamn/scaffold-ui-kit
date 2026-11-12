// What a story's html could not evaluate at rest, summarized for reading: the
// warnings one component gives for one reason counted on one line, every
// other warning as it is, in the order they came.

import { describe, expect, it } from 'vitest';
import { summarizeHtmlWarnings } from '../src/lib/html-warnings';

describe('summarizeHtmlWarnings', () => {
  it("counts one component's warnings for one reason on one line, at the first one's place", () => {
    expect(
      summarizeHtmlWarnings([
        "TabsTrigger: could not evaluate baseId + '-trigger-' + value (baseId is not defined)",
        'TabsTrigger: could not evaluate isActive (isActive is not defined)',
        "TabsTrigger: could not evaluate baseId + '-content-' + value (baseId is not defined)",
        "TabsTrigger: could not evaluate isActive ? 0 : -1 (isActive is not defined)",
        "TabsContent: could not evaluate baseId + '-content-' + value (baseId is not defined)",
      ]),
    ).toEqual([
      'TabsTrigger: could not evaluate 2 expressions (baseId is not defined)',
      'TabsTrigger: could not evaluate 2 expressions (isActive is not defined)',
      // Another component's stays its own.
      "TabsContent: could not evaluate baseId + '-content-' + value (baseId is not defined)",
    ]);
  });

  it('keeps a warning whose reason no other shares, and one it cannot read, as they are', () => {
    const warnings = [
      'Picker: could not evaluate api.select (api is not defined)',
      "Picker: could not evaluate items.map(render) (Cannot read properties of undefined (reading 'map'))",
      'could not evaluate listId (listId is not defined)',
      'Picker: something else entirely',
    ];
    expect(summarizeHtmlWarnings(warnings)).toEqual(warnings);
  });

  it('reads a reason holding parentheses of its own, and a warning without a component', () => {
    expect(
      summarizeHtmlWarnings([
        "could not evaluate items.map(render) (Cannot read properties of undefined (reading 'map'))",
        "could not evaluate items.map(other) (Cannot read properties of undefined (reading 'map'))",
      ]),
    ).toEqual(["could not evaluate 2 expressions (Cannot read properties of undefined (reading 'map'))"]);
  });

  it('counts a repeated warning once', () => {
    const warning = 'Combobox: could not evaluate listId (listId is not defined)';
    expect(summarizeHtmlWarnings([warning, warning])).toEqual([warning]);
  });
});
