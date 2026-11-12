// A status pill around a default slot: the editor's host component in the
// browser tests. Its story file seeds the slot with text and curates one
// scenario; the tone prop is stamped on the root, so a prop edit shows. The
// component, its tone and its scenario carry descriptions, in markdown, for
// the stage to show: inline code, a code block and a tag left bare, which
// shows as text.
export default {
  type: 'component',
  name: 'Tag',
  description: [
    'A status pill, set beside the thing whose state it names.',
    'Its text is the **slot**; set `tone` for how loud it is, or wrap it in a <label> of your own.',
    '```html\n<Tag tone="loud">Late</Tag>\n```',
  ].join('\n\n'),
  props: {
    tone: { type: "'calm' | 'loud'", default: 'calm', description: 'How loud the pill is: `calm` or `loud`.' },
  },
  children: [
    {
      type: 'element',
      tag: 'span',
      attributes: { class: ['FixtureTag'], 'data-tone': { $expression: 'tone' } },
      children: [{ type: 'slot' }],
    },
  ],
};
