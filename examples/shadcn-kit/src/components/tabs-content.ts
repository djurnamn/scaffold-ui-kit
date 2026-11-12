import { defineTemplate } from '@js-template-engine/types';

/** A tab panel: visible while its value is the selected one. */
export default defineTemplate({
  type: 'component',
  name: 'TabsContent',
  description:
    'The panel shown while the `TabsTrigger` of the same value is selected.',
  props: {
    value: {
      type: 'string',
      required: true,
      description: 'Pairs the panel with the `TabsTrigger` of the same value.',
    },
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
      ].join('\n'),
      legacy: { script: '$: isActive = $active === value;' },
      runes: { script: 'const isActive = $derived($active === value);' },
    },
  },
  children: [
    {
      type: 'element',
      tag: 'div',
      passthrough: true,
      attributes: {
        role: 'tabpanel',
        tabindex: '0',
        'data-slot': 'tabs-content',
        id: { $expression: "baseId + '-content-' + value" },
        'aria-labelledby': { $expression: "baseId + '-trigger-' + value" },
        'data-state': { $expression: "isActive ? 'active' : 'inactive'" },
        hidden: { $expression: '!isActive' },
      },
      extensions: { tailwind: { classes: ['flex-1', 'outline-none'] } },
      children: [{ type: 'slot' }],
    },
  ],
});
