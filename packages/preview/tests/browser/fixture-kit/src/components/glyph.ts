// A content-less component: no slot, one enumerated prop the preview
// generates scenarios from. The gallery view deep-links into its story.
export default {
  type: 'component',
  name: 'Glyph',
  props: {
    name: { type: "'check' | 'cross'", default: 'check' },
  },
  children: [
    {
      type: 'element',
      tag: 'span',
      attributes: { class: ['FixtureGlyph'] },
      children: [{ type: 'text', expression: 'name' }],
    },
  ],
};
