// Not standalone (see its story file): no story of its own, offered to the editor
// and used as IconLabel's icon.
export default {
  type: 'component',
  name: 'Dot',
  children: [
    { type: 'element', tag: 'i', attributes: { class: ['FixtureDot'] }, children: [{ type: 'text', content: '*' }] },
  ],
};
