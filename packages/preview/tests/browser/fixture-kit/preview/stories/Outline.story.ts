import type { Story } from '@scaffold-ui-kit/preview/types';

// A tree three levels deep, drawn by a part, Branch, that lists its items, each
// a Tag, and calls itself for each item's children: an empty list ends it.
const tree = [
  {
    name: 'docs',
    children: [{ name: 'guides', children: [{ name: 'install', children: [] }] }],
  },
  { name: 'src', children: [] },
];

const story: Story = {
  unlisted: true,
  generate: false,
  slots: {
    default: {
      kind: 'part',
      name: 'Branch',
      parameters: ['items'],
      props: { items: tree },
      react:
        '<ul className="FixtureBranch">{items.map((item) => <li key={item.name}><Tag>{item.name}</Tag><Branch items={item.children} /></li>)}</ul>',
      vue: '<ul class="FixtureBranch"><li v-for="item in items" :key="item.name"><Tag>{{ item.name }}</Tag><Branch :items="item.children" /></li></ul>',
      svelte:
        '<ul class="FixtureBranch">{#each items as item (item.name)}<li><Tag>{item.name}</Tag>{@render Branch({ items: item.children })}</li>{/each}</ul>',
      html: [
        {
          type: 'element',
          tag: 'ul',
          attributes: { class: ['FixtureBranch'] },
          children: [
            {
              type: 'iteration',
              items: 'items',
              item: 'item',
              key: 'item.name',
              children: [
                {
                  type: 'element',
                  tag: 'li',
                  children: [
                    { type: 'element', tag: 'Tag', children: [{ type: 'text', expression: 'item.name' }] },
                    { type: 'element', tag: 'Branch', attributes: { items: { $expression: 'item.children' } } },
                  ],
                },
              ],
            },
          ],
        },
      ],
      imports: ['Tag'],
    },
  },
};

export default story;
