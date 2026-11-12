import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Feedback',
  defaultProps: { title: 'Heads up', withCloseButton: true },
  slots: {
    default: {
      kind: 'text',
      value: 'Something happened that you should know about.',
    },
    named: { icon: { kind: 'text', value: 'ⓘ' } },
  },
  scenarios: [
    {
      id: 'danger',
      label: 'Danger',
      props: { color: 'red', variant: 'filled', title: 'Payment failed' },
    },
  ],
};
export default story;
