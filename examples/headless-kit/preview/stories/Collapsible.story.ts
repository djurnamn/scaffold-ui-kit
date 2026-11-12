import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Disclosure',
  slots: {
    default: {
      kind: 'fragment',
      children: [
        {
          kind: 'element',
          component: 'CollapsibleTrigger',
          children: { kind: 'text', value: 'Show details' },
        },
        {
          kind: 'element',
          component: 'CollapsibleContent',
          children: { kind: 'text', value: 'Hidden details.' },
        },
      ],
    },
  },
  scenarios: [
    {
      id: 'controlled',
      label: 'Controlled',
      props: { open: true },
      description:
        'The story owns `open`; the trigger in any pane closes all three.',
    },
  ],
};
export default story;
