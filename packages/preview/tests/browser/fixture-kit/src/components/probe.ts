// An unlisted story (see its story file): reachable at its address and through
// the testing helpers, but in no navigation, picker or count.
export default {
  type: 'component',
  name: 'Probe',
  props: {
    label: { type: 'string', default: 'probe' },
  },
  children: [
    {
      type: 'element',
      tag: 'span',
      attributes: { class: ['FixtureProbe'] },
      children: [{ type: 'text', expression: 'label' }],
    },
  ],
};
