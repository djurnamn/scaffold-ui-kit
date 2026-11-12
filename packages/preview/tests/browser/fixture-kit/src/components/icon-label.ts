// An icon beside a label: a named slot (`icon`) and a text prop, so its
// story file can name a default scenario and one that clears the label.
export default {
  type: 'component',
  name: 'IconLabel',
  props: {
    label: { type: 'string', default: 'Label' },
  },
  children: [
    {
      type: 'element',
      tag: 'span',
      attributes: { class: ['FixtureIconLabel'] },
      children: [
        { type: 'slot', name: 'icon' },
        {
          type: 'element',
          tag: 'span',
          attributes: { class: ['FixtureIconLabel__label'] },
          children: [{ type: 'text', expression: 'label' }],
        },
      ],
    },
  ],
};
