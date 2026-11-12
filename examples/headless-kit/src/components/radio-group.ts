import { defineTemplate } from '@js-template-engine/types';

// WAI-ARIA APG: Radio Group, with a roving tabindex. Driven by an `options`
// array: the arrow keys move focus and selection together, skip disabled
// options and wrap. A scoped slot renders each option's label.
export default defineTemplate({
  type: 'component',
  name: 'RadioGroup',
  description:
    'A group of radio buttons built from `options`. Give `value` to control the selection, or `defaultValue` to let the group keep its own. Label the group with `aria-label` or `aria-labelledby`.',
  props: {
    options: { type: 'RadioGroupOption[]', required: true },
    value: {
      type: 'string',
      description:
        'The selected value. Leave it out to let the group keep its own.',
      bindable: {
        current: 'currentValue',
        setter: 'select',
        defaultProp: 'defaultValue',
        changeProp: 'onValueChange',
      },
    },
    defaultValue: {
      type: 'string',
      description: 'The initially selected value when uncontrolled.',
    },
    onValueChange: {
      type: '(value: string) => void',
      description: 'Called with the newly selected value.',
    },
    disabled: { type: 'boolean', default: false },
    orientation: { type: "'horizontal' | 'vertical'", default: 'vertical' },
  },
  // A module-scope type: every target exports it and the kit's barrel re-exports it.
  imports: [
    'export interface RadioGroupOption {\n  value: string;\n  label: string;\n  disabled?: boolean;\n}',
  ],
  // Keyboard handling is DOM-only, so one script serves every target.
  script: [
    'function moveFocus(event: { currentTarget: EventTarget | null }, step: number) {',
    '  const current = event.currentTarget as HTMLElement;',
    '  const items = Array.from(',
    '    current.parentElement!.querySelectorAll<HTMLElement>(\'[role="radio"]:not([disabled])\'),',
    '  );',
    '  const index = items.indexOf(current);',
    '  const next = items[(index + step + items.length) % items.length];',
    '  next?.focus();',
    '  next?.click();',
    '}',
    'function focusNext(event: { currentTarget: EventTarget | null }) {',
    '  moveFocus(event, 1);',
    '}',
    'function focusPrevious(event: { currentTarget: EventTarget | null }) {',
    '  moveFocus(event, -1);',
    '}',
  ].join('\n'),
  children: [
    {
      type: 'element',
      tag: 'div',
      passthrough: true,
      attributes: {
        role: 'radiogroup',
        'aria-orientation': { $expression: 'orientation' },
        'data-orientation': { $expression: 'orientation' },
        'data-disabled': { $expression: "disabled ? '' : undefined" },
      },
      children: [
        {
          type: 'iteration',
          items: 'options',
          item: 'option',
          key: 'option.value',
          children: [
            {
              type: 'element',
              tag: 'button',
              attributes: {
                type: 'button',
                role: 'radio',
                value: { $expression: 'option.value' },
                'aria-checked': {
                  $expression: 'option.value === currentValue',
                },
                'data-state': {
                  $expression:
                    "option.value === currentValue ? 'checked' : 'unchecked'",
                },
                'data-disabled': {
                  $expression: "disabled || option.disabled ? '' : undefined",
                },
                disabled: { $expression: 'disabled || option.disabled' },
                // The tab stop is the selected option, or the first enabled
                // option when nothing enabled is selected, so the group
                // always keeps one.
                tabindex: {
                  $expression:
                    'option.value === (options.find((candidate) => !candidate.disabled && candidate.value === currentValue) ?? options.find((candidate) => !candidate.disabled))?.value ? 0 : -1',
                },
              },
              events: [
                { name: 'click', handler: '() => select(option.value)' },
                {
                  name: 'keydown',
                  handler: 'focusNext',
                  modifiers: ['arrow-down', 'prevent'],
                },
                {
                  name: 'keydown',
                  handler: 'focusNext',
                  modifiers: ['arrow-right', 'prevent'],
                },
                {
                  name: 'keydown',
                  handler: 'focusPrevious',
                  modifiers: ['arrow-up', 'prevent'],
                },
                {
                  name: 'keydown',
                  handler: 'focusPrevious',
                  modifiers: ['arrow-left', 'prevent'],
                },
              ],
              children: [
                {
                  type: 'slot',
                  exposes: {
                    option: { value: 'option', type: 'RadioGroupOption' },
                    checked: {
                      value: 'option.value === currentValue',
                      type: 'boolean',
                    },
                  },
                  fallback: [{ type: 'text', expression: 'option.label' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});
