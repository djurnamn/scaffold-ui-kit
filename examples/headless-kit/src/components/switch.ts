import { defineTemplate } from '@js-template-engine/types';

// WAI-ARIA APG: Switch. `role="switch"` and `aria-checked` on a button; Space
// and Enter both toggle, as a native button does. With a `name`, a hidden input
// follows the button so the switch submits with its form. The root is therefore
// a fragment of two nodes, and the button takes the consumer's attributes
// through `rest` rather than `passthrough`. No per-target code.
export default defineTemplate({
  type: 'component',
  name: 'Switch',
  description:
    'An on/off switch. Give `checked` to control it (`v-model` in Vue, `bind:checked` in Svelte), or `defaultChecked` to let it keep its own state. Label it with `aria-label` or a `<label for>`.',
  props: {
    checked: {
      type: 'boolean',
      description:
        'Whether the switch is on. Leave it out to let the switch keep its own.',
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
      description: 'The initial state when uncontrolled.',
    },
    onCheckedChange: {
      type: '(checked: boolean) => void',
      description: 'Called with the next state.',
    },
    disabled: { type: 'boolean', default: false },
    name: {
      type: 'string',
      description:
        'Submits `value` under this name while on, through a hidden input.',
    },
    value: { type: 'string', default: 'on' },
  },
  rest: { tag: 'button' },
  extensions: { vue: { model: 'checked' } },
  children: [
    {
      type: 'element',
      tag: 'button',
      attributes: {
        $spread: { $expression: 'rest' },
        type: 'button',
        role: 'switch',
        'aria-checked': { $expression: 'isChecked' },
        'data-state': { $expression: "isChecked ? 'checked' : 'unchecked'" },
        'data-disabled': { $expression: "disabled ? '' : undefined" },
        disabled: { $expression: 'disabled' },
      },
      events: [{ name: 'click', handler: '() => setChecked((on) => !on)' }],
      children: [
        {
          type: 'element',
          tag: 'span',
          attributes: {
            'data-part': 'thumb',
            'data-state': {
              $expression: "isChecked ? 'checked' : 'unchecked'",
            },
            'aria-hidden': 'true',
          },
        },
        { type: 'slot' },
      ],
    },
    {
      type: 'conditional',
      conditions: [
        {
          statement: 'if',
          condition: 'name !== undefined && isChecked',
          children: [
            {
              type: 'element',
              tag: 'input',
              attributes: {
                type: 'hidden',
                name: { $expression: 'name' },
                value: { $expression: 'value' },
              },
            },
          ],
        },
      ],
    },
  ],
});
