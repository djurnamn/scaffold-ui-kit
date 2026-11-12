// An unlisted story that throws as it renders: `label` has no default, so
// reading from it fails in every framework, and each pane shows the error.
export default {
  type: 'component',
  name: 'Faulty',
  props: {
    label: { type: 'string' },
  },
  children: [
    {
      type: 'element',
      tag: 'span',
      attributes: { class: ['FixtureFaulty'] },
      children: [{ type: 'text', expression: 'label.toUpperCase()' }],
    },
  ],
};
