export default {
  type: 'component',
  name: 'Badge',
  props: { tone: { type: "'calm' | 'loud'", default: 'calm' } },
  children: [{ type: 'element', tag: 'span', children: [{ type: 'slot' }] }],
};
