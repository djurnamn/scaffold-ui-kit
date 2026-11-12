// An unlisted story with a state that renders nothing: while `visible` and
// `worded` are off, every target leaves the mount empty, as a dismissed banner
// does. `worded` renders a text node and no element.
export default {
  type: 'component',
  name: 'Vacant',
  props: {
    visible: { type: 'boolean', default: false },
    worded: { type: 'boolean', default: false },
  },
  children: [
    {
      type: 'conditional',
      conditions: [
        {
          statement: 'if',
          condition: 'visible',
          children: [
            {
              type: 'element',
              tag: 'button',
              attributes: { class: ['FixtureVacant'], type: 'button' },
              children: [{ type: 'text', content: 'Shown' }],
            },
          ],
        },
        {
          statement: 'else-if',
          condition: 'worded',
          children: [{ type: 'text', content: 'Words alone' }],
        },
      ],
    },
  ],
};
