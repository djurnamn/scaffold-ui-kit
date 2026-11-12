import { defineTemplate } from '@js-template-engine/types';

// role=tooltip, rendered only while open. Hovering it cancels a pending close (WCAG 1.4.13).
export default defineTemplate({
  type: 'component',
  name: 'TooltipContent',
  description:
    'The `tooltip` text of a `Tooltip`. Rendered only while open; the pointer may rest on it without it closing.',
  extensions: {
    react: {
      imports: ["import { useTooltipContext } from './Tooltip';"],
      script:
        "const { open, contentId, openNow, scheduleClose } = useTooltipContext('TooltipContent');",
    },
    vue: {
      imports: [
        "import { computed, inject } from 'vue';",
        "import { tooltipKey } from './Tooltip.vue';",
      ],
      script: [
        'const context = inject(tooltipKey)!;',
        'const open = computed(() => context.open);',
        'const contentId = computed(() => context.contentId);',
        'const openNow = () => context.openNow();',
        'const scheduleClose = () => context.scheduleClose();',
      ].join('\n'),
    },
    svelte: {
      imports: [
        "import { getContext } from 'svelte';",
        "import { tooltipKey, type TooltipContextStore } from './Tooltip.svelte';",
      ],
      script:
        'const context = getContext<TooltipContextStore>(tooltipKey);\nconst { open, contentId, openNow, scheduleClose } = $derived($context);',
    },
  },
  children: [
    {
      type: 'conditional',
      conditions: [
        {
          statement: 'if',
          condition: 'open',
          children: [
            {
              type: 'element',
              tag: 'div',
              passthrough: true,
              attributes: {
                role: 'tooltip',
                id: { $expression: 'contentId' },
                'data-state': 'open',
              },
              events: [
                { name: 'pointerenter', handler: '() => openNow()' },
                { name: 'pointerleave', handler: '() => scheduleClose()' },
              ],
              children: [{ type: 'slot' }],
            },
          ],
        },
      ],
    },
  ],
});
