import { defineTemplate } from '@js-template-engine/types';

/** A tab button: reads the Tabs context, selects its value on click. */
export default defineTemplate({
  type: 'component',
  name: 'TabsTrigger',
  description:
    'The button that activates its `TabsContent`. Place inside `TabsList`.',
  props: {
    value: {
      type: 'string',
      required: true,
      description:
        'Pairs the trigger with the `TabsContent` of the same value.',
    },
    disabled: { type: 'boolean', default: false },
  },
  extensions: {
    react: {
      imports: [
        "import { useContext } from 'react';",
        "import { TabsContext } from './Tabs';",
      ],
      script: [
        'const tabs = useContext(TabsContext);',
        'const isActive = tabs.active === value;',
        'const baseId = tabs.baseId;',
        'function choose() {',
        '  tabs.select(value);',
        '}',
      ].join('\n'),
    },
    vue: {
      imports: [
        "import { computed, inject } from 'vue';",
        "import { tabsKey } from './Tabs.vue';",
      ],
      script: [
        'const tabs = inject(tabsKey)!;',
        'const isActive = computed(() => tabs.active.value === value);',
        'const baseId = tabs.baseId;',
        'function choose() {',
        '  tabs.select(value);',
        '}',
      ].join('\n'),
    },
    svelte: {
      imports: [
        "import { getContext } from 'svelte';",
        "import { tabsKey, type TabsContextValue } from './Tabs.svelte';",
      ],
      script: [
        'const tabs = getContext<TabsContextValue>(tabsKey);',
        'const active = tabs.active;',
        'const baseId = tabs.baseId;',
        'function choose() {',
        '  tabs.select(value);',
        '}',
      ].join('\n'),
      legacy: { script: '$: isActive = $active === value;' },
      runes: { script: 'const isActive = $derived($active === value);' },
    },
  },
  children: [
    {
      type: 'element',
      tag: 'button',
      passthrough: true,
      attributes: {
        type: 'button',
        role: 'tab',
        'data-slot': 'tabs-trigger',
        id: { $expression: "baseId + '-trigger-' + value" },
        'aria-controls': { $expression: "baseId + '-content-' + value" },
        'aria-selected': { $expression: 'isActive' },
        'data-state': { $expression: "isActive ? 'active' : 'inactive'" },
        tabindex: { $expression: 'isActive ? 0 : -1' },
        disabled: { $expression: 'disabled' },
      },
      events: [{ name: 'click', handler: 'choose' }],
      extensions: {
        tailwind: {
          classes: [
            'data-[state=active]:bg-background',
            'dark:data-[state=active]:text-foreground',
            'focus-visible:border-ring',
            'focus-visible:ring-ring/50',
            'focus-visible:outline-ring',
            'dark:data-[state=active]:border-input',
            'dark:data-[state=active]:bg-input/30',
            'text-foreground',
            'dark:text-muted-foreground',
            'inline-flex',
            'h-[calc(100%-1px)]',
            'flex-1',
            'items-center',
            'justify-center',
            'gap-1.5',
            'rounded-md',
            'border',
            'border-transparent',
            'px-2',
            'py-1',
            'text-sm',
            'font-medium',
            'whitespace-nowrap',
            'transition-[color,box-shadow]',
            'focus-visible:ring-[3px]',
            'focus-visible:outline-1',
            'disabled:pointer-events-none',
            'disabled:opacity-50',
            'data-[state=active]:shadow-sm',
            '[&_svg]:pointer-events-none',
            '[&_svg]:shrink-0',
            "[&_svg:not([class*='size-'])]:size-4",
          ],
        },
      },
      children: [{ type: 'slot' }],
    },
  ],
});
