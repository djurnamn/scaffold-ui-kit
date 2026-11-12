// An unlisted story (see its story file) whose child throws as it renders,
// the parent itself being fine: each pane shows the error in its place.
export default {
  type: 'component',
  name: 'FaultyParent',
  children: [
    {
      type: 'element',
      tag: 'div',
      attributes: { class: ['FixtureFaultyParent'] },
      children: [{ type: 'slot' }],
    },
  ],
};
