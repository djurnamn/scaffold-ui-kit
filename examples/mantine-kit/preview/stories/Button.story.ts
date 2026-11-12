import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Buttons',
  slots: {
    default: { kind: 'text', value: 'Button' },
    named: { leftSection: { kind: 'text', value: '★' } },
  },
  controls: { classNames: false, styles: false },
  generate: { exclude: ['type'] },
  scenarios: [
    {
      id: 'as-link',
      label: 'As a link',
      description:
        '`component="a"` renders an anchor; React types `href` and the ref by it.',
      props: {
        component: 'a',
        href: 'https://example.com',
        variant: 'light',
        disabled: true,
      },
    },
    { id: 'loading', label: 'Loading', props: { loading: true } },
    {
      id: 'styles-api',
      label: 'Styles API',
      description:
        '`styles.root` and `styles.section` override inner parts per instance.',
      props: {
        styles: {
          root: { boxShadow: '0 4px 12px rgba(0,0,0,.25)' },
          section: { color: 'gold' },
        },
      },
    },
  ],
};
export default story;
