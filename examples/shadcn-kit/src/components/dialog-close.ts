import { defineTemplate } from '@js-template-engine/types';

/** Closes its Dialog. Unstyled and polymorphic like `DialogTrigger`: `<DialogClose as={Button} variant="outline">Cancel</DialogClose>`. */
export default defineTemplate({
  type: 'component',
  name: 'DialogClose',
  description:
    'A button that closes the dialog, such as a footer "Cancel". Place inside `DialogContent`. Pass `as` to render a component, such as `Button`, in its place.',
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
        'const dialog = useContext(DialogContext);\nconst hide = () => dialog.setOpen(false);',
    },
    vue: {
      imports: [
        "import { inject } from 'vue';",
        "import { dialogKey } from './Dialog.vue';",
      ],
      script:
        'const dialog = inject(dialogKey)!;\nconst hide = () => dialog.setOpen(false);',
    },
    svelte: {
      imports: [
        "import { getContext } from 'svelte';",
        "import { dialogKey, type DialogContextValue } from './Dialog.svelte';",
      ],
      script:
        'const dialog = getContext<DialogContextValue>(dialogKey);\nconst hide = () => dialog.setOpen(false);',
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
      attributes: { type: 'button', 'data-slot': 'dialog-close' },
      events: [{ name: 'click', handler: 'hide' }],
      children: [{ type: 'slot' }],
    },
  ],
});
