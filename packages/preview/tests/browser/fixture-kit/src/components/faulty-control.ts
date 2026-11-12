// An unlisted story that renders a control and throws once `label` goes away,
// so a browser test can make it throw part way through a keyboard walk.
export default {
  type: 'component',
  name: 'FaultyControl',
  props: {
    label: { type: 'string' },
  },
  children: [
    {
      type: 'element',
      tag: 'button',
      attributes: { class: ['FixtureFaultyControl'], type: 'button' },
      children: [{ type: 'text', expression: 'label.toUpperCase()' }],
    },
  ],
};
