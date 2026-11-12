import { defineTemplate } from '@js-template-engine/types';

/**
 * The control that opens its Dialog. Unstyled and polymorphic: `as` renders another tag or a component in
 * its place, so `<DialogTrigger as={Button} variant="outline">` stands in for shadcn's `<DialogTrigger asChild><Button variant="outline">`.
 */
export default defineTemplate({
  type: 'component',
  name: 'DialogTrigger',
  description:
    'The button that opens the dialog. Place inside `Dialog`. Pass `as` to render a component, such as `Button`, in its place.',
  props: {
    as: {
      type: 'any',
      description:
        "The element or component to render, such as the kit's `Button`; defaults to a button.",
    },
  },
  extensions: {
    react: {
      imports: [
        "import { useContext } from 'react';",
        "import { DialogContext } from './Dialog';",
      ],
      script:
        'const dialog = useContext(DialogContext);\nconst isOpen = dialog.open;\nconst baseId = dialog.baseId;\nconst show = () => dialog.setOpen(true);',
    },
    vue: {
      imports: [
        "import { inject } from 'vue';",
        "import { dialogKey } from './Dialog.vue';",
      ],
      script:
        'const dialog = inject(dialogKey)!;\nconst isOpen = dialog.open;\nconst baseId = dialog.baseId;\nconst show = () => dialog.setOpen(true);',
    },
    svelte: {
      imports: [
        "import { getContext } from 'svelte';",
        "import { dialogKey, type DialogContextValue } from './Dialog.svelte';",
      ],
      script:
        'const dialog = getContext<DialogContextValue>(dialogKey);\nconst open = dialog.open;\nconst baseId = dialog.baseId;\nconst show = () => dialog.setOpen(true);',
      legacy: { script: '$: isOpen = $open;' },
      runes: { script: 'const isOpen = $derived($open);' },
    },
  },
  children: [
    {
      type: 'element',
      tag: {
        $expression: "as ?? 'button'",
        default: 'button',
        componentValued: true,
      },
      passthrough: true,
      attributes: {
        type: 'button',
        'data-slot': 'dialog-trigger',
        'aria-haspopup': 'dialog',
        id: { $expression: "baseId + '-trigger'" },
        'aria-controls': { $expression: "baseId + '-content'" },
        'aria-expanded': { $expression: 'isOpen' },
        'data-state': { $expression: "isOpen ? 'open' : 'closed'" },
      },
      events: [{ name: 'click', handler: 'show' }],
      children: [{ type: 'slot' }],
    },
  ],
});
