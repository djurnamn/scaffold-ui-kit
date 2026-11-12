import type { Story } from '@scaffold-ui-kit/preview/types';

const icon =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>';

const story: Story = {
  category: 'Feedback',
  slots: {
    default: {
      kind: 'html',
      tag: 'p',
      children: {
        kind: 'text',
        value: 'Your session expires in five minutes. Save your work.',
      },
    },
    named: {
      title: { kind: 'text', value: 'Heads up!' },
      icon: {
        kind: 'raw',
        react:
          '<svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>',
        vue: icon,
        svelte: icon,
        html: icon,
      },
    },
  },
};
export default story;
