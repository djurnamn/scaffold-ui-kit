import { defineTemplate } from '@js-template-engine/types';

// A two-state button (WAI-ARIA APG: Button, toggle variant). State reaches the
// consumer as `aria-pressed` and `data-state="on" | "off"`. The controlled and
// uncontrolled modes are generated from the `bindable` protocol on `pressed`.
export default defineTemplate({
  type: 'component',
  name: 'Toggle',
  description:
    'A two-state button. Give `pressed` to control it (`v-model` in Vue, `bind:pressed` in Svelte), or `defaultPressed` to let it keep its own state.',
  props: {
    pressed: {
      type: 'boolean',
      description:
        'The pressed state. Leave it out to let the toggle keep its own.',
      bindable: {
        current: 'isPressed',
        setter: 'setPressed',
        defaultProp: 'defaultPressed',
        changeProp: 'onPressedChange',
      },
    },
    defaultPressed: {
      type: 'boolean',
      default: false,
      description: 'The initial pressed state when uncontrolled.',
    },
    onPressedChange: {
      type: '(pressed: boolean) => void',
      description: 'Called with the next pressed state.',
    },
    disabled: { type: 'boolean', default: false },
  },
  extensions: { vue: { model: 'pressed' } },
  children: [
    {
      type: 'element',
      tag: 'button',
      passthrough: true,
      attributes: {
        type: 'button',
        'aria-pressed': { $expression: 'isPressed' },
        'data-state': { $expression: "isPressed ? 'on' : 'off'" },
        'data-disabled': { $expression: "disabled ? '' : undefined" },
        disabled: { $expression: 'disabled' },
      },
      events: [{ name: 'click', handler: '() => setPressed((on) => !on)' }],
      children: [{ type: 'slot' }],
    },
  ],
});
