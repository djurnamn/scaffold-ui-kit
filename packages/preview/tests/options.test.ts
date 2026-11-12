// The option descriptor's helpers (src/options.ts): an option's kind follows
// from its fields, its group defaults to the context group, and `optionProblems` names
// every option a shell could not place or show unambiguously.

import { describe, expect, it } from 'vitest';
import {
  acceptsOptionValue,
  CONTEXT_OPTION_GROUP,
  KIT_OPTION_GROUP,
  optionGroup,
  optionKind,
  optionProblems,
  type PreviewOption,
} from '../src/options';

const mode: PreviewOption = {
  id: 'mode',
  label: 'mode',
  values: [
    { value: 'light', label: 'light' },
    { value: 'dark', label: 'dark' },
  ],
  default: 'light',
  scope: 'global',
  apply: { type: 'root-attribute', attribute: 'data-mode' },
};

const outline: PreviewOption = {
  id: 'outline',
  label: 'outline',
  default: false,
  group: 'canvas',
  scope: 'global',
  apply: { type: 'class', className: 'is-outlined' },
};

describe('optionKind and optionGroup', () => {
  it('infers a choice from values and a boolean from their absence', () => {
    expect(optionKind(mode)).toBe('choice');
    expect(optionKind(outline)).toBe('boolean');
  });

  it('puts an option without a group in the context group', () => {
    expect(optionGroup(mode)).toBe(CONTEXT_OPTION_GROUP);
    expect(optionGroup({ ...mode, group: KIT_OPTION_GROUP })).toBe('kit');
    expect(optionGroup(outline)).toBe('canvas');
  });

  it("accepts one of a choice's values, and a boolean for a boolean", () => {
    expect(acceptsOptionValue(mode, 'dark')).toBe(true);
    expect(acceptsOptionValue(mode, 'sepia')).toBe(false);
    expect(acceptsOptionValue(mode, true)).toBe(false);
    expect(acceptsOptionValue(outline, true)).toBe(true);
    expect(acceptsOptionValue(outline, 'true')).toBe(false);
  });
});

describe('optionProblems', () => {
  it('finds nothing wrong with sound options', () => {
    expect(optionProblems([mode, outline])).toEqual([]);
  });

  it('names an option whose kind is ambiguous', () => {
    expect(
      optionProblems([
        { ...mode, default: true },
        { ...mode, id: 'tone', default: 'sepia' },
        { ...outline, default: 'on' },
        { ...mode, id: 'empty', values: [] },
      ]),
    ).toEqual([
      "preview.options[0] ('mode'): a choice option (one with values) needs a string default",
      "preview.options[1] ('tone'): default 'sepia' is not one of its values",
      "preview.options[2] ('outline'): an option without values is a boolean and needs a boolean default; a choice lists its values",
      "preview.options[3] ('empty'): values must be a non-empty list of { value, label } strings",
    ]);
  });

  it('names placement and widget fields, a repeated id, a bad scope and a bad group', () => {
    expect(
      optionProblems([
        { ...outline, slot: 'footer', control: 'toggle' },
        { ...outline, scope: 'session', group: '' },
        { ...mode, id: '' },
      ]),
    ).toEqual([
      "preview.options[0] ('outline'): slot is not an option field - an option says where it belongs with group",
      "preview.options[0] ('outline'): control is not an option field - an option with values is a choice, one with a boolean default a boolean",
      "preview.options[1] ('outline'): another option has the id 'outline'",
      "preview.options[1] ('outline'): scope must be 'global' or 'story'",
      "preview.options[1] ('outline'): group must be a non-empty string",
      'preview.options[2]: id must be a non-empty string',
    ]);
  });

  it('names a key an option, one of its values or its apply does not take', () => {
    expect(
      optionProblems([
        { ...mode, description: 'Color mode', values: [{ value: 'light', label: 'light', hint: 'day' }] },
        { ...outline, apply: { type: 'class', className: 'is-outlined', var: '--outline' } },
        { ...outline, id: 'custom', title: undefined, apply: { type: 'custom', anything: true } },
      ]),
    ).toEqual([
      "preview.options[0] ('mode'): unknown key 'description'; an option takes id, label, title, values, default, group, scope, apply",
      "preview.options[0] ('mode'): unknown key 'values[0].hint'; a value takes value, label",
      "preview.options[1] ('outline'): unknown key 'apply.var'; a 'class' apply takes type, on, className, target",
    ]);
  });

  it('wants a list', () => {
    expect(optionProblems({})).toEqual(['preview.options must be an array']);
  });
});
