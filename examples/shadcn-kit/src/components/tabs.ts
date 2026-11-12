import { defineTemplate } from '@js-template-engine/types';

/** Radix-style Tabs root: owns the selected value (controlled or not) and shares it with its parts through a context. */
export default defineTemplate({
  type: 'component',
  name: 'Tabs',
  parts: ['TabsList', 'TabsTrigger', 'TabsContent'],
  description:
    'A set of layered sections of content, known as tab panels, displayed one at a time. Compose with `TabsList`, `TabsTrigger` and `TabsContent`.',
  rest: { tag: 'div' },
  props: {
    value: {
      type: 'string',
      description:
        'The selected tab, when controlled. Leave it out to let the tabs keep their own.',
      bindable: {
        current: 'selected',
        setter: 'select',
        defaultProp: 'defaultValue',
        changeProp: 'onValueChange',
      },
    },
    defaultValue: {
      type: 'string',
      description: 'The tab selected at first, when uncontrolled.',
    },
    onValueChange: {
      type: '(value: string) => void',
      description: 'Called with the value of the tab the user selects.',
    },
  },
  ids: { baseId: 'tabs' },
  imports: [
    "import { cn } from 'shadcn-style-kit-example/lib';",
    "import { consumerClass, withoutClass } from '@scaffold-ui-kit/helpers/runtime';",
  ],
  extensions: {
    react: {
      imports: [
        "import { createContext } from 'react';",
        'export interface TabsContextValue { baseId: string; active: string | undefined; select: (value: string) => void }',
        "export const TabsContext = createContext<TabsContextValue>({ baseId: '', active: undefined, select: () => {} });",
      ],
    },
    vue: {
      imports: [
        "import { provide, type InjectionKey, type Ref } from 'vue';",
        'export interface TabsContextValue { baseId: string; active: Readonly<Ref<string | undefined>>; select: (value: string) => void }',
        "export const tabsKey: InjectionKey<TabsContextValue> = Symbol('tabs');",
      ],
      script: 'provide(tabsKey, { baseId, active: selected, select });',
    },
    svelte: {
      imports: [
        "import { setContext } from 'svelte';",
        "import type { Readable } from 'svelte/store';",
        'export interface TabsContextValue { baseId: string; active: Readable<string | undefined>; select: (value: string) => void }',
        "export const tabsKey = Symbol('tabs');",
      ],
      // Svelte shares a changing value through a store: a writable kept in step in legacy mode, `toStore` in runes mode.
      legacy: {
        imports: ["import { writable } from 'svelte/store';"],
        script: [
          'const active = writable<string | undefined>(selected);',
          '$: active.set(selected);',
          'setContext<TabsContextValue>(tabsKey, { baseId, active, select });',
        ].join('\n'),
      },
      runes: {
        imports: ["import { toStore } from 'svelte/store';"],
        script:
          'setContext<TabsContextValue>(tabsKey, { baseId, active: toStore(() => selected), select });',
      },
    },
  },
  children: [
    {
      type: 'fragment',
      extensions: {
        react: {
          tag: 'TabsContext',
          attributes: {
            value: { $expression: '{ baseId, active: selected, select }' },
          },
        },
      },
      children: [
        {
          type: 'element',
          tag: 'div',
          attributes: {
            $spread: { $expression: 'withoutClass(rest)' },
            class: [{ $expression: "cn('flex flex-col gap-2', consumerClass(rest))" }],
            'data-slot': 'tabs',
          },
          children: [{ type: 'slot' }],
        },
      ],
    },
  ],
});
