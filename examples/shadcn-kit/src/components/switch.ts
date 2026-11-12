import { defineTemplate } from '@js-template-engine/types';

/** A shadcn-style switch: a `role="switch"` button with a two-way `checked`. Vue consumers can write a bare `v-model`. */
export default defineTemplate({
  type: 'component',
  name: 'Switch',
  description: 'A control that allows the user to toggle between on and off.',
  props: {
    checked: {
      type: 'boolean',
      description:
        'Whether the switch is on, when controlled. Leave it out to let the switch keep its own.',
      bindable: {
        current: 'isChecked',
        setter: 'setChecked',
        defaultProp: 'defaultChecked',
        changeProp: 'onCheckedChange',
      },
    },
    defaultChecked: {
      type: 'boolean',
      default: false,
      description: 'Whether the switch is on at first, when uncontrolled.',
    },
    onCheckedChange: {
      type: '(checked: boolean) => void',
      description: 'Called with the new state when the switch is toggled.',
    },
    disabled: { type: 'boolean', default: false },
  },
  extensions: { vue: { model: 'checked' } },
  children: [
    {
      type: 'element',
      tag: 'button',
      passthrough: true,
      attributes: {
        type: 'button',
        role: 'switch',
        'data-slot': 'switch',
        'aria-checked': { $expression: 'isChecked' },
        'data-state': { $expression: "isChecked ? 'checked' : 'unchecked'" },
        disabled: { $expression: 'disabled' },
      },
      events: [
        { name: 'click', handler: '() => setChecked((checked) => !checked)' },
      ],
      extensions: {
        tailwind: {
          classes: [
            'peer',
            'data-[state=checked]:bg-primary',
            'data-[state=unchecked]:bg-input',
            'focus-visible:border-ring',
            'focus-visible:ring-ring/50',
            'dark:data-[state=unchecked]:bg-input/80',
            'inline-flex',
            'h-[1.15rem]',
            'w-8',
            'shrink-0',
            'items-center',
            'rounded-full',
            'border',
            'border-transparent',
            'shadow-xs',
            'transition-all',
            'outline-none',
            'focus-visible:ring-[3px]',
            'disabled:cursor-not-allowed',
            'disabled:opacity-50',
          ],
        },
      },
      children: [
        {
          type: 'element',
          tag: 'span',
          attributes: {
            'data-slot': 'switch-thumb',
            'data-state': {
              $expression: "isChecked ? 'checked' : 'unchecked'",
            },
          },
          extensions: {
            tailwind: {
              classes: [
                'bg-background',
                'dark:data-[state=unchecked]:bg-foreground',
                'dark:data-[state=checked]:bg-primary-foreground',
                'pointer-events-none',
                'block',
                'size-4',
                'rounded-full',
                'ring-0',
                'transition-transform',
                'data-[state=checked]:translate-x-[calc(100%-2px)]',
                'data-[state=unchecked]:translate-x-0',
              ],
            },
          },
          children: [],
        },
      ],
    },
  ],
});
