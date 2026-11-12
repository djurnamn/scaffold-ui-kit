// An unlisted story that throws a string rather than an Error: a pane must
// still hear of it, with the string as the message.
export default {
  type: 'component',
  name: 'FaultyValue',
  children: [
    {
      type: 'element',
      tag: 'span',
      attributes: { class: ['FixtureFaultyValue'] },
      children: [
        { type: 'text', expression: "(() => { throw 'thrown text'; })()" },
      ],
    },
  ],
};
