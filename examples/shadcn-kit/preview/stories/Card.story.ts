import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Data display',
  defaultProps: {
    title: 'Card title',
    description: 'Card description',
    class: 'w-80',
  },
  slots: {
    default: { kind: 'text', value: 'Card content' },
    named: {
      action: {
        kind: 'element',
        component: 'Badge',
        children: { kind: 'text', value: 'New' },
      },
      footer: {
        kind: 'element',
        component: 'Button',
        props: { variant: 'outline' },
        children: { kind: 'text', value: 'Cancel' },
      },
    },
  },
  scenarios: [
    { id: 'dark', label: 'On dark', props: {}, options: { mode: true } },
  ],
};
export default story;
