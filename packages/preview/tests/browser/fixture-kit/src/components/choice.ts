// A select whose two-way `value` starts from `defaultValue` (see its
// story file): its story gives `defaultValue`, and a scenario unsets it with
// `null`, so every pane starts the select at its first option, as the story's
// code does. Unlisted, so the other tests' navigation is unchanged.
export default {
  type: 'component',
  name: 'Choice',
  props: {
    value: {
      type: 'string',
      bindable: {
        current: 'selected',
        setter: 'setValue',
        defaultProp: 'defaultValue',
        changeProp: 'onValueChange',
      },
    },
    defaultValue: { type: 'string' },
    onValueChange: { type: '(value: string) => void' },
  },
  script:
    'function handleChange(event: { target: EventTarget | null }) {\n  setValue((event.target as HTMLSelectElement).value);\n}',
  children: [
    {
      type: 'element',
      tag: 'select',
      attributes: {
        class: ['FixtureChoice'],
        value: { $expression: 'selected' },
      },
      events: [{ name: 'change', handler: 'handleChange' }],
      children: [
        {
          type: 'element',
          tag: 'option',
          attributes: { value: 'first' },
          children: [{ type: 'text', content: 'First' }],
        },
        {
          type: 'element',
          tag: 'option',
          attributes: { value: 'second' },
          children: [{ type: 'text', content: 'Second' }],
        },
      ],
    },
  ],
};
