import { defineTemplate } from '@js-template-engine/types';

// WAI-ARIA APG: Disclosure. The root owns the open state and the content id,
// and hands { open, disabled, contentId, toggle } to CollapsibleTrigger and
// CollapsibleContent through each framework's context. The context type is
// shared; only providing it differs per target.
export default defineTemplate({
  type: 'component',
  name: 'Collapsible',
  parts: ['CollapsibleTrigger', 'CollapsibleContent'],
  description:
    'The root of a disclosure. Owns the open state; put a `CollapsibleTrigger` and a `CollapsibleContent` inside it.',
  props: {
    open: {
      type: 'boolean',
      description:
        'The open state. Leave it out to let the collapsible keep its own.',
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
      description: 'The initial open state when uncontrolled.',
    },
    onOpenChange: {
      type: '(open: boolean) => void',
      description: 'Called with the next open state.',
    },
    disabled: { type: 'boolean', default: false },
  },
  ids: { contentId: 'collapsible-content' },
  rest: { tag: 'div' },
  imports: [
    'export interface CollapsibleContextValue {\n  open: boolean;\n  disabled: boolean;\n  contentId: string;\n  toggle: () => void;\n}',
  ],
  // The generated setter does the controlled and uncontrolled work in every target.
  script: 'function toggle() {\n  if (!disabled) setOpen((open) => !open);\n}',
  extensions: {
    react: {
      imports: [
        "import { createContext, useContext } from 'react';",
        'export const CollapsibleContext = createContext<CollapsibleContextValue | null>(null);',
        'export function useCollapsibleContext(part: string): CollapsibleContextValue {\n  const context = useContext(CollapsibleContext);\n  if (!context) throw new Error(`<${part}> must be used within <Collapsible>`);\n  return context;\n}',
      ],
      script: 'const context = { open: isOpen, disabled, contentId, toggle };',
    },
    vue: {
      imports: [
        "import { computed, provide, reactive, type InjectionKey } from 'vue';",
        "export const collapsibleKey: InjectionKey<CollapsibleContextValue> = Symbol('collapsible');",
      ],
      script:
        'provide(collapsibleKey, reactive({ open: isOpen, disabled: computed(() => disabled), contentId, toggle }));',
    },
    svelte: {
      imports: [
        "import { setContext } from 'svelte';",
        "import { toStore, type Readable } from 'svelte/store';",
        "export const collapsibleKey = Symbol('collapsible');",
        'export type CollapsibleContextStore = Readable<CollapsibleContextValue>;',
      ],
      script:
        'setContext(collapsibleKey, toStore(() => ({ open: isOpen, disabled, contentId, toggle })));',
    },
  },
  children: [
    {
      // React provides a context by rendering it; Vue and Svelte provide it from the script.
      type: 'fragment',
      extensions: {
        react: {
          tag: 'CollapsibleContext',
          attributes: { value: { $expression: 'context' } },
        },
      },
      children: [
        {
          type: 'element',
          tag: 'div',
          attributes: {
            $spread: { $expression: 'rest' },
            'data-state': { $expression: "isOpen ? 'open' : 'closed'" },
            'data-disabled': { $expression: "disabled ? '' : undefined" },
          },
          children: [{ type: 'slot' }],
        },
      ],
    },
  ],
});
