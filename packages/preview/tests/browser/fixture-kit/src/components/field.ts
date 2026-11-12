// A text field with two two-way values (see its story file): `value`, which its
// story gives, and `marks`, which it leaves to the field. Typing mid-text in
// any pane keeps the caret where it is, and a mark made in a pane stays
// while the story's `value` changes. Its root forwards the consumer's
// attributes, so the story's class, style and tabindex reach it in every
// pane, React's as React spells them. Unlisted, so the other tests'
// navigation is unchanged.
export default {
  type: 'component',
  name: 'Field',
  props: {
    value: {
      type: 'string',
      bindable: {
        current: 'text',
        setter: 'setValue',
        defaultProp: 'defaultValue',
        changeProp: 'onValueChange',
      },
    },
    defaultValue: { type: 'string', default: '' },
    onValueChange: { type: '(value: string) => void' },
    marks: {
      type: 'string[]',
      bindable: {
        current: 'markList',
        setter: 'setMarks',
        defaultProp: 'defaultMarks',
        changeProp: 'onMarksChange',
      },
    },
    defaultMarks: { type: 'string[]', default: [] },
    onMarksChange: { type: '(marks: string[]) => void' },
  },
  script:
    'function handleInput(event: { target: EventTarget | null }) {\n  setValue((event.target as HTMLInputElement).value);\n}',
  extensions: { vue: { model: 'value' } },
  children: [
    {
      type: 'element',
      tag: 'div',
      passthrough: true,
      attributes: { class: ['FixtureField'] },
      children: [
        {
          type: 'element',
          tag: 'input',
          attributes: {
            class: ['FixtureFieldInput'],
            value: { $expression: 'text' },
          },
          events: [{ name: 'input', handler: 'handleInput' }],
          extensions: {
            react: { events: [{ name: 'change', handler: 'handleInput' }] },
          },
        },
        {
          type: 'element',
          tag: 'button',
          attributes: {
            class: ['FixtureFieldMark'],
            type: 'button',
            'data-marks': { $expression: 'markList.length' },
          },
          events: [
            {
              name: 'click',
              handler: '() => setMarks((marks) => [...marks, text])',
            },
          ],
          children: [{ type: 'text', content: 'Mark' }],
        },
      ],
    },
  ],
};
