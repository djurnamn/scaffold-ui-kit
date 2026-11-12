import type { Story } from '@scaffold-ui-kit/preview/types';

const items = [
  {
    value: 'item-1',
    title: 'Is it accessible?',
    content: 'Yes. It is built on native details and summary elements.',
  },
  {
    value: 'item-2',
    title: 'Is it styled?',
    content:
      "Yes. It comes with default styles that match the other components' aesthetic.",
  },
  {
    value: 'item-3',
    title: 'Is it animated?',
    content:
      'Yes. The content height animates where the browser supports interpolate-size.',
  },
];

const story: Story = {
  category: 'Disclosure',
  defaultProps: { items, defaultValue: ['item-1'], class: 'w-96' },
  controls: { onValueChange: false },
  scenarios: [
    {
      id: 'controlled',
      label: 'Controlled',
      props: { value: ['item-2'] },
      description:
        'A given `value`: opening a section in any pane opens it in every pane, and the address follows.',
    },
    {
      id: 'multiple',
      label: 'Multiple',
      props: { type: 'multiple', defaultValue: ['item-1', 'item-2'] },
      description: 'Sections open independently.',
    },
    {
      id: 'disabled-item',
      label: 'One section disabled',
      props: { items: [...items.slice(0, 2), { ...items[2], disabled: true }] },
    },
    {
      id: 'dark',
      label: 'On dark',
      props: { defaultValue: ['item-3'] },
      options: { mode: true },
    },
  ],
};
export default story;
