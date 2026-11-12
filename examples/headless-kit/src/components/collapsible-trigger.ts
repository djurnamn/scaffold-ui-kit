import { defineTemplate } from '@js-template-engine/types';

// Reads { open, disabled, contentId, toggle } from the Collapsible root's context,
// which the root module exports (a React context, a Vue InjectionKey, a Svelte context key).
export default defineTemplate({
  type: 'component',
  name: 'CollapsibleTrigger',
  description:
    'The button that toggles its `Collapsible`. Carries `aria-expanded` and `aria-controls`.',
  extensions: {
    react: {
      imports: ["import { useCollapsibleContext } from './Collapsible';"],
      script:
        "const { open, disabled, contentId, toggle } = useCollapsibleContext('CollapsibleTrigger');",
    },
    vue: {
      imports: [
        "import { computed, inject } from 'vue';",
        "import { collapsibleKey } from './Collapsible.vue';",
      ],
      script: [
        'const context = inject(collapsibleKey)!;',
        'const open = computed(() => context.open);',
        'const disabled = computed(() => context.disabled);',
        'const contentId = computed(() => context.contentId);',
        'const toggle = () => context.toggle();',
      ].join('\n'),
    },
    svelte: {
      imports: [
        "import { getContext } from 'svelte';",
        "import { collapsibleKey, type CollapsibleContextStore } from './Collapsible.svelte';",
      ],
      script:
        'const context = getContext<CollapsibleContextStore>(collapsibleKey);\nconst { open, disabled, contentId, toggle } = $derived($context);',
    },
  },
  children: [
    {
      type: 'element',
      tag: 'button',
      passthrough: true,
      attributes: {
        type: 'button',
        'aria-controls': { $expression: 'contentId' },
        'aria-expanded': { $expression: 'open' },
        'data-state': { $expression: "open ? 'open' : 'closed'" },
        'data-disabled': { $expression: "disabled ? '' : undefined" },
        disabled: { $expression: 'disabled' },
      },
      events: [{ name: 'click', handler: 'toggle' }],
      children: [{ type: 'slot' }],
    },
  ],
});
