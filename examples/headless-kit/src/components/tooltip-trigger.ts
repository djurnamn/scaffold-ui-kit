import { defineTemplate } from '@js-template-engine/types';

// The element the tooltip describes. aria-describedby points at the content only while it is
// rendered, so it never dangles.
export default defineTemplate({
  type: 'component',
  name: 'TooltipTrigger',
  description:
    'The button a `Tooltip` describes. Hover or focus shows the tooltip, and `aria-describedby` points at it while it is open.',
  extensions: {
    react: {
      imports: ["import { useTooltipContext } from './Tooltip';"],
      script:
        "const { open, triggerId, contentId, scheduleOpen, scheduleClose, openNow, closeNow } = useTooltipContext('TooltipTrigger');",
    },
    vue: {
      imports: [
        "import { computed, inject } from 'vue';",
        "import { tooltipKey } from './Tooltip.vue';",
      ],
      script: [
        'const context = inject(tooltipKey)!;',
        'const open = computed(() => context.open);',
        'const triggerId = computed(() => context.triggerId);',
        'const contentId = computed(() => context.contentId);',
        'const scheduleOpen = () => context.scheduleOpen();',
        'const scheduleClose = () => context.scheduleClose();',
        'const openNow = () => context.openNow();',
        'const closeNow = () => context.closeNow();',
      ].join('\n'),
    },
    svelte: {
      imports: [
        "import { getContext } from 'svelte';",
        "import { tooltipKey, type TooltipContextStore } from './Tooltip.svelte';",
      ],
      script:
        'const context = getContext<TooltipContextStore>(tooltipKey);\nconst { open, triggerId, contentId, scheduleOpen, scheduleClose, openNow, closeNow } = $derived($context);',
    },
  },
  children: [
    {
      type: 'element',
      tag: 'button',
      passthrough: true,
      attributes: {
        type: 'button',
        id: { $expression: 'triggerId' },
        'aria-describedby': { $expression: 'open ? contentId : undefined' },
        'data-state': { $expression: "open ? 'open' : 'closed'" },
      },
      events: [
        { name: 'pointerenter', handler: '() => scheduleOpen()' },
        { name: 'pointerleave', handler: '() => scheduleClose()' },
        { name: 'focus', handler: '() => openNow()' },
        { name: 'blur', handler: '() => closeNow()' },
      ],
      children: [{ type: 'slot' }],
    },
  ],
});
