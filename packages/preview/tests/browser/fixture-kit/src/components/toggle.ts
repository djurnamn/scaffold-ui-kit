// A two-way toggle (see its story file): `pressed` is a bindable object, so each
// target generates its controlled and uncontrolled value. Its story gives
// `pressed`, so a click in any pane reports `onPressedChange`, which the
// preview writes back into the story's props; every pane, the html pane and
// the address follow. Unlisted, so the other tests' navigation is unchanged.
export default {
  type: 'component',
  name: 'Toggle',
  props: {
    pressed: {
      type: 'boolean',
      bindable: {
        current: 'isPressed',
        setter: 'setPressed',
        defaultProp: 'defaultPressed',
        changeProp: 'onPressedChange',
      },
    },
    defaultPressed: { type: 'boolean', default: false },
    onPressedChange: { type: '(pressed: boolean) => void' },
  },
  extensions: { vue: { model: 'pressed' } },
  children: [
    {
      type: 'element',
      tag: 'button',
      attributes: {
        class: ['FixtureToggle'],
        type: 'button',
        'aria-pressed': { $expression: 'isPressed' },
      },
      events: [{ name: 'click', handler: '() => setPressed((pressed) => !pressed)' }],
      children: [{ type: 'text', content: 'Toggle' }],
    },
  ],
};
