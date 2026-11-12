import { defineTemplate } from '@js-template-engine/types';

// The region a CollapsibleTrigger controls (WAI-ARIA APG: Disclosure). It stays
// in the DOM and is `hidden` while closed, so the trigger's `aria-controls`
// always resolves, and find-in-page and closing animations have an element.
export default defineTemplate({
  type: 'component',
  name: 'CollapsibleContent',
  description:
    "The region its `CollapsibleTrigger` shows and hides. It stays in the DOM and is `hidden` while closed, so the trigger's `aria-controls` always points at it.",
  extensions: {
    react: {
      imports: ["import { useCollapsibleContext } from './Collapsible';"],
      script:
        "const { open, disabled, contentId } = useCollapsibleContext('CollapsibleContent');",
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
      ].join('\n'),
    },
    svelte: {
      imports: [
        "import { getContext } from 'svelte';",
        "import { collapsibleKey, type CollapsibleContextStore } from './Collapsible.svelte';",
      ],
      script:
        'const context = getContext<CollapsibleContextStore>(collapsibleKey);\nconst { open, disabled, contentId } = $derived($context);',
    },
  },
  children: [
    {
      type: 'element',
      tag: 'div',
      passthrough: true,
      attributes: {
        id: { $expression: 'contentId' },
        hidden: { $expression: '!open' },
        'data-state': { $expression: "open ? 'open' : 'closed'" },
        'data-disabled': { $expression: "disabled ? '' : undefined" },
      },
      children: [{ type: 'slot' }],
    },
  ],
});
