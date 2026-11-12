// The type names a component's generated module exports, read from its
// template's module-scope lines per target: what the kit's package
// entry re-exports, which a story's source names a prop's type by.

import { describe, expect, it } from 'vitest';
import { exportedTypeNames, exportedTypeNamesOf, exportedTypesOf } from '../src/lib/exported-types';

describe('exportedTypeNamesOf', () => {
  it('reads exported type declarations and type-only export lists', () => {
    expect(exportedTypeNamesOf('export interface DateValue { day?: string }')).toEqual(['DateValue']);
    expect(exportedTypeNamesOf("export type Tone = 'calm' | 'loud';")).toEqual(['Tone']);
    expect(exportedTypeNamesOf('export enum Size { Small, Large }')).toEqual(['Size']);
    expect(exportedTypeNamesOf('export declare class Store {}')).toEqual(['Store']);
    expect(exportedTypeNamesOf("export type { Row, Cell as GridCell } from './grid';")).toEqual(['Row', 'GridCell']);
    expect(exportedTypeNamesOf("export { type Row, helper } from './grid';")).toEqual(['Row']);
  });

  it('names nothing a consumer cannot import as a type from the module', () => {
    expect(exportedTypeNamesOf('interface Hidden { a: string }')).toEqual([]);
    expect(exportedTypeNamesOf("import type { Shared } from './shared';")).toEqual([]);
    expect(exportedTypeNamesOf('export const limit = 3;')).toEqual([]);
    expect(exportedTypeNamesOf("export { helper } from './grid';")).toEqual([]);
  });
});

describe('exportedTypeNames', () => {
  const template = {
    imports: ['export interface DateValue { day?: string }\nexport type Part = "day" | "month";'],
    extensions: {
      react: { imports: ['export type ReactOnly = string;'] },
      svelte: { imports: ['export type SvelteOnly = string;'], importsStrategy: 'replace' },
    },
  };

  it("merges a target's own lines, or takes them in place of the template's", () => {
    expect(exportedTypeNames(template, 'react')).toEqual(['DateValue', 'Part', 'ReactOnly']);
    expect(exportedTypeNames(template, 'vue')).toEqual(['DateValue', 'Part']);
    expect(exportedTypeNames(template, 'svelte')).toEqual(['SvelteOnly']);
  });

  it('gives a component per target, none for one written by hand', () => {
    expect(exportedTypesOf({ template }, ['vue', 'svelte'])).toEqual({ vue: ['DateValue', 'Part'], svelte: ['SvelteOnly'] });
    expect(exportedTypesOf({}, ['react'])).toBeUndefined();
    expect(exportedTypesOf({ template: { imports: [] } }, ['react'])).toBeUndefined();
  });
});
