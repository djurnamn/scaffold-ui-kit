import { defineTemplate } from '@js-template-engine/types';

/** The dialog's heading; its id labels the DialogContent. */
export default defineTemplate({
  type: 'component',
  name: 'DialogTitle',
  description:
    "The dialog's heading, read out as its accessible name. Place inside `DialogContent`.",
  extensions: {
    react: {
      imports: [
        "import { useContext } from 'react';",
        "import { DialogContext } from './Dialog';",
      ],
      script: 'const baseId = useContext(DialogContext).baseId;',
    },
    vue: {
      imports: [
        "import { inject } from 'vue';",
        "import { dialogKey } from './Dialog.vue';",
      ],
      script: 'const baseId = inject(dialogKey)!.baseId;',
    },
    svelte: {
      imports: [
        "import { getContext } from 'svelte';",
        "import { dialogKey, type DialogContextValue } from './Dialog.svelte';",
      ],
      script:
        'const baseId = getContext<DialogContextValue>(dialogKey).baseId;',
    },
  },
  children: [
    {
      type: 'element',
      tag: 'h2',
      passthrough: true,
      attributes: {
        'data-slot': 'dialog-title',
        id: { $expression: "baseId + '-title'" },
      },
      extensions: {
        tailwind: { classes: ['text-lg', 'leading-none', 'font-semibold'] },
      },
      children: [{ type: 'slot' }],
    },
  ],
});
