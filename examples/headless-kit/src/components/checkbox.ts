import { defineTemplate } from '@js-template-engine/types';

// WAI-ARIA APG: Checkbox, including the mixed state. The value is tri-state
// (true | false | 'indeterminate'): `role="checkbox"` on a button, with
// `aria-checked="mixed"` and `data-state="indeterminate"` when indeterminate.
// The default slot is scoped, exposing the state so a consumer can render an
// indicator; plain children work too.
export default defineTemplate({
  type: 'component',
  name: 'Checkbox',
  description:
    "A tri-state checkbox: `true`, `false` or `'indeterminate'`. Give `checked` to control it, or `defaultChecked` to let it keep its own state. The default slot receives `{ checked, state }` for an indicator.",
  props: {
    checked: {
      type: "boolean | 'indeterminate'",
      description:
        'The checked state. Leave it out to let the checkbox keep its own.',
      bindable: {
        current: 'currentChecked',
        setter: 'setChecked',
        defaultProp: 'defaultChecked',
        changeProp: 'onCheckedChange',
      },
    },
    defaultChecked: {
      type: "boolean | 'indeterminate'",
      default: false,
      description: 'The initial state when uncontrolled.',
    },
    onCheckedChange: {
      type: "(checked: boolean | 'indeterminate') => void",
      description: 'Called with the next checked state.',
    },
    disabled: { type: 'boolean', default: false },
    required: { type: 'boolean', default: false },
  },
  extensions: { vue: { model: 'checked' } },
  // The handler only exists to carry the modifiers: `prevent` + `enter` cancels Enter.
  script: 'function preventEnter() {}',
  children: [
    {
      type: 'element',
      tag: 'button',
      passthrough: true,
      attributes: {
        type: 'button',
        role: 'checkbox',
        'aria-checked': {
          $expression:
            "currentChecked === 'indeterminate' ? 'mixed' : currentChecked",
        },
        'aria-required': { $expression: 'required || undefined' },
        'data-state': {
          $expression:
            "currentChecked === 'indeterminate' ? 'indeterminate' : currentChecked ? 'checked' : 'unchecked'",
        },
        'data-disabled': { $expression: "disabled ? '' : undefined" },
        disabled: { $expression: 'disabled' },
      },
      events: [
        {
          name: 'click',
          handler:
            "() => setChecked((value) => (value === 'indeterminate' ? true : !value))",
        },
        // A checkbox toggles on Space only; Enter would submit a form or click the button.
        {
          name: 'keydown',
          handler: 'preventEnter',
          modifiers: ['prevent', 'enter'],
        },
      ],
      children: [
        {
          type: 'slot',
          exposes: {
            checked: {
              value: 'currentChecked',
              type: "boolean | 'indeterminate'",
            },
            state: {
              value:
                "currentChecked === 'indeterminate' ? 'indeterminate' : currentChecked ? 'checked' : 'unchecked'",
              type: "'checked' | 'unchecked' | 'indeterminate'",
            },
          },
        },
      ],
    },
  ],
});
