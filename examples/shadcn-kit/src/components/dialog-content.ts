import { defineTemplate } from '@js-template-engine/types';

/**
 * The modal panel: a native `<dialog>` opened with `showModal()` (top layer, focus trap, inert page) through the kit's
 * shared `syncModal`. Escape and a click on the backdrop close it through the Dialog's `setOpen`, so a controlled
 * `open` stays in charge.
 */
export default defineTemplate({
  type: 'component',
  name: 'DialogContent',
  description:
    'The modal panel shown while the dialog is open, with a close button in its corner. Place inside `Dialog`, with a `DialogTitle` that names the panel; a panel without one needs an `aria-label`.',
  props: {
    showCloseButton: {
      type: 'boolean',
      default: true,
      description:
        'Whether the panel shows its own close button in the top right corner.',
    },
  },
  extensions: {
    react: {
      imports: [
        "import { useContext, useEffect, useRef } from 'react';",
        "import { syncModal } from 'shadcn-style-kit-example/lib';",
        "import { DialogContext } from './Dialog';",
      ],
      script: [
        'const dialog = useContext(DialogContext);',
        'const isOpen = dialog.open;',
        'const baseId = dialog.baseId;',
        'const hide = () => dialog.setOpen(false);',
        'const dialogElement = useRef<HTMLDialogElement>(null);',
        'useEffect(() => syncModal(dialogElement.current, isOpen), [isOpen]);',
      ].join('\n'),
    },
    vue: {
      imports: [
        "import { inject, onMounted, useTemplateRef, watch } from 'vue';",
        "import { syncModal } from 'shadcn-style-kit-example/lib';",
        "import { dialogKey } from './Dialog.vue';",
      ],
      script: [
        'const dialog = inject(dialogKey)!;',
        'const isOpen = dialog.open;',
        'const baseId = dialog.baseId;',
        'const hide = () => dialog.setOpen(false);',
        "const dialogElement = useTemplateRef<HTMLDialogElement>('dialog-element');",
        'const sync = () => syncModal(dialogElement.value, isOpen.value);',
        "onMounted(() => { sync(); watch(isOpen, sync, { flush: 'post' }); });",
      ].join('\n'),
    },
    svelte: {
      imports: [
        "import { getContext } from 'svelte';",
        "import { syncModal } from 'shadcn-style-kit-example/lib';",
        "import { dialogKey, type DialogContextValue } from './Dialog.svelte';",
      ],
      script: [
        'const dialog = getContext<DialogContextValue>(dialogKey);',
        'const open = dialog.open;',
        'const baseId = dialog.baseId;',
        'const hide = () => dialog.setOpen(false);',
      ].join('\n'),
      // `element` is the panel's own <dialog>, which Svelte binds on a passthrough root.
      legacy: { script: '$: isOpen = $open;\n$: syncModal(element, isOpen);' },
      runes: {
        script:
          'const isOpen = $derived($open);\n$effect(() => syncModal(element, isOpen));',
      },
    },
  },
  children: [
    {
      type: 'element',
      tag: 'dialog',
      passthrough: true,
      attributes: {
        'data-slot': 'dialog-content',
        'data-state': { $expression: "isOpen ? 'open' : 'closed'" },
        id: { $expression: "baseId + '-content'" },
        // Points at the DialogTitle. Without one, the reference matches no
        // element and the accessible name comes from an `aria-label` instead.
        'aria-labelledby': { $expression: "baseId + '-title'" },
      },
      events: [
        // Escape fires `cancel`: let the Dialog decide, so a controlled `open` that stays true keeps the dialog up.
        {
          name: 'cancel',
          handler: '(event) => { event.preventDefault(); hide(); }',
        },
        // The panel's own content sits in the inner div, so a click whose target is the <dialog> itself hit the backdrop.
        {
          name: 'click',
          handler:
            '(event) => { if (event.target === event.currentTarget) hide(); }',
        },
      ],
      extensions: {
        react: { attributes: { ref: { $expression: 'dialogElement' } } },
        vue: { attributes: { ref: 'dialog-element' } },
        tailwind: {
          classes: [
            'bg-background',
            'text-foreground',
            'm-auto',
            'w-full',
            'max-w-[calc(100%-2rem)]',
            'sm:max-w-lg',
            'rounded-lg',
            'border',
            'p-0',
            'shadow-lg',
            'backdrop:bg-black/50',
          ],
        },
      },
      children: [
        {
          type: 'element',
          tag: 'div',
          attributes: { 'data-slot': 'dialog-panel' },
          extensions: {
            tailwind: { classes: ['relative', 'grid', 'gap-4', 'p-6'] },
          },
          children: [
            { type: 'slot' },
            {
              type: 'conditional',
              conditions: [
                {
                  statement: 'if',
                  condition: 'showCloseButton',
                  children: [
                    {
                      type: 'element',
                      tag: 'button',
                      attributes: {
                        type: 'button',
                        'data-slot': 'dialog-close',
                        'aria-label': 'Close',
                      },
                      events: [{ name: 'click', handler: 'hide' }],
                      extensions: {
                        tailwind: {
                          classes: [
                            'absolute',
                            'top-4',
                            'right-4',
                            'rounded-xs',
                            'opacity-70',
                            'transition-opacity',
                            'hover:opacity-100',
                            'focus:outline-hidden',
                            'focus:ring-2',
                            'focus:ring-ring',
                            'focus:ring-offset-2',
                            'text-lg',
                            'leading-none',
                          ],
                        },
                      },
                      children: [{ type: 'text', content: '×' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});
