// A button around a default slot: the component the browser tests add as a
// child in the scenario editor. Its class name lets a test count the
// rendered buttons and read their text. A click marks it pressed, which a
// framework pane shows and the html pane, running no behavior, never does,
// and calls its `onPress` event with its text and `onActivate` with the click.
export default {
  type: 'component',
  name: 'Button',
  props: {
    // Events: the preview's events view records each call, one with the
    // button's text and one with the click itself.
    onPress: { type: '(label: string) => void' },
    onActivate: { type: '(event: MouseEvent) => void' },
  },
  children: [
    {
      type: 'element',
      tag: 'button',
      attributes: { class: ['FixtureButton'], type: 'button' },
      events: [
        {
          name: 'click',
          handler:
            "(event) => (event.currentTarget.setAttribute('data-pressed', ''), onPress?.(event.currentTarget.textContent), onActivate?.(event))",
        },
      ],
      children: [{ type: 'slot' }],
    },
  ],
};
