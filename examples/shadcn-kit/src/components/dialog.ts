import { defineTemplate } from '@js-template-engine/types';

/** Radix-style Dialog root: renders no element of its own, only shares a two-way `open` with its trigger, content and close buttons. */
export default defineTemplate({
  type: 'component',
  name: 'Dialog',
  parts: ['DialogTrigger', 'DialogContent', 'DialogTitle', 'DialogClose'],
  description:
    'A modal window over the page, built on the native `<dialog>`. Compose with `DialogTrigger`, `DialogContent` and `DialogClose`.',
  props: {
    open: {
      type: 'boolean',
      description:
        'Whether the dialog shows, when controlled. Leave it out to let the dialog keep its own.',
      bindable: {
        current: 'isOpen',
        setter: 'setOpen',
        defaultProp: 'defaultOpen',
        changeProp: 'onOpenChange',
      },
    },
    defaultOpen: {
      type: 'boolean',
      default: false,
      description: 'Whether the dialog shows at first, when uncontrolled.',
    },
    onOpenChange: {
      type: '(open: boolean) => void',
      description: 'Called when the dialog opens or closes.',
    },
  },
  ids: { baseId: 'dialog' },
  extensions: {
    react: {
      imports: [
        "import { createContext } from 'react';",
        'export interface DialogContextValue { baseId: string; open: boolean; setOpen: (open: boolean) => void }',
        "export const DialogContext = createContext<DialogContextValue>({ baseId: '', open: false, setOpen: () => {} });",
      ],
    },
    vue: {
      imports: [
        "import { provide, type InjectionKey, type Ref } from 'vue';",
        'export interface DialogContextValue { baseId: string; open: Readonly<Ref<boolean>>; setOpen: (open: boolean) => void }',
        "export const dialogKey: InjectionKey<DialogContextValue> = Symbol('dialog');",
      ],
      script: 'provide(dialogKey, { baseId, open: isOpen, setOpen });',
    },
    svelte: {
      imports: [
        "import { setContext } from 'svelte';",
        "import type { Readable } from 'svelte/store';",
        'export interface DialogContextValue { baseId: string; open: Readable<boolean>; setOpen: (open: boolean) => void }',
        "export const dialogKey = Symbol('dialog');",
      ],
      // Svelte shares a changing value through a store: a writable kept in step in legacy mode, `toStore` in runes mode.
      legacy: {
        imports: ["import { writable } from 'svelte/store';"],
        script: [
          'const openStore = writable(isOpen);',
          '$: openStore.set(isOpen);',
          'setContext<DialogContextValue>(dialogKey, { baseId, open: openStore, setOpen });',
        ].join('\n'),
      },
      runes: {
        imports: ["import { toStore } from 'svelte/store';"],
        script:
          'setContext<DialogContextValue>(dialogKey, { baseId, open: toStore(() => isOpen), setOpen });',
      },
    },
  },
  children: [
    {
      type: 'fragment',
      extensions: {
        react: {
          tag: 'DialogContext',
          attributes: {
            value: { $expression: '{ baseId, open: isOpen, setOpen }' },
          },
        },
      },
      children: [{ type: 'slot' }],
    },
  ],
});
