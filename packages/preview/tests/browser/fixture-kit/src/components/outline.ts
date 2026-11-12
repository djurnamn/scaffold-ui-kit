// An unlisted story (see its story file) whose content is a tree: a part that
// lists its items and calls itself for each item's children.
export default {
  type: 'component',
  name: 'Outline',
  children: [
    {
      type: 'element',
      tag: 'div',
      attributes: { class: ['FixtureOutline'] },
      children: [{ type: 'slot' }],
    },
  ],
};
