import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Buttons',
  slots: { default: { kind: 'text', value: 'Button' } },
  controls: { as: false },
  scenarios: [
    {
      id: 'as-link',
      label: 'As a link',
      props: { as: 'a', href: '#', variant: 'link' },
      description: 'The polymorphic root: `as="a"` renders an anchor.',
    },
    {
      id: 'on-dark',
      label: 'Outline on dark',
      props: { variant: 'outline' },
      options: { mode: true },
    },
  ],
};
export default story;
