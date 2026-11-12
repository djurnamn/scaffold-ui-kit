import { defineTemplate } from '@js-template-engine/types';

/** A shadcn-style input: a passthrough native input with a two-way `value` (React `value`/`onChange` still work; Vue takes a bare `v-model`; Svelte `bind:value`). */
export default defineTemplate({
  type: 'component',
  name: 'Input',
  description: 'Displays a form input field.',
  props: {
    type: { type: 'string', default: 'text' },
    value: {
      type: 'string',
      description:
        'The text, when controlled. Leave it out to let the input keep its own.',
      bindable: {
        current: 'text',
        setter: 'setText',
        defaultProp: 'defaultValue',
        changeProp: 'onValueChange',
      },
    },
    defaultValue: {
      type: 'string',
      default: '',
      description: 'The text at first, when uncontrolled.',
    },
    onValueChange: {
      type: '(value: string) => void',
      description: 'Called with the new text on every input.',
    },
  },
  extensions: { vue: { model: 'value' } },
  children: [
    {
      type: 'element',
      tag: 'input',
      passthrough: true,
      attributes: {
        'data-slot': 'input',
        type: { $expression: 'type' },
        value: { $expression: 'text' },
      },
      events: [
        {
          name: 'input',
          handler:
            '(event) => setText((event.currentTarget as HTMLInputElement).value)',
        },
      ],
      extensions: {
        // React's onChange is its per-keystroke event, and a `value` without it warns; the DOM `change` the others would hear fires on blur.
        react: {
          events: [
            {
              name: 'change',
              handler: '(event) => setText(event.currentTarget.value)',
            },
          ],
        },
        tailwind: {
          classes: [
            'file:text-foreground',
            'placeholder:text-muted-foreground',
            'selection:bg-primary',
            'selection:text-primary-foreground',
            'dark:bg-input/30',
            'border-input',
            'h-9',
            'w-full',
            'min-w-0',
            'rounded-md',
            'border',
            'bg-transparent',
            'px-3',
            'py-1',
            'text-base',
            'shadow-xs',
            'transition-[color,box-shadow]',
            'outline-none',
            'file:inline-flex',
            'file:h-7',
            'file:border-0',
            'file:bg-transparent',
            'file:text-sm',
            'file:font-medium',
            'disabled:pointer-events-none',
            'disabled:cursor-not-allowed',
            'disabled:opacity-50',
            'md:text-sm',
            'focus-visible:border-ring',
            'focus-visible:ring-ring/50',
            'focus-visible:ring-[3px]',
            'aria-invalid:ring-destructive/20',
            'dark:aria-invalid:ring-destructive/40',
            'aria-invalid:border-destructive',
          ],
        },
      },
    },
  ],
});
