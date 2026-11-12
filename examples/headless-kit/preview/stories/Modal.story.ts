import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Overlays',
  defaultProps: {
    title: 'Delete this project?',
    description: 'This cannot be undone.',
  },
  slots: {
    named: { trigger: { kind: 'text', value: 'Delete project' } },
    default: {
      kind: 'text',
      value:
        'Escape, a press outside or the close button closes it; focus returns to the trigger.',
    },
  },
  scenarios: [
    {
      id: 'starts-open',
      label: 'Open by default',
      props: { defaultOpen: true },
      description: 'Uncontrolled, starting open.',
    },
    {
      id: 'controlled',
      label: 'Controlled',
      props: { open: false },
      description: 'The story owns `open`.',
    },
    {
      id: 'no-title',
      label: 'Named by a label',
      props: {
        title: null,
        description: null,
        label: 'Quick actions',
        defaultOpen: true,
      },
      description: 'No visible title: the dialog is named by `label`.',
    },
  ],
};
export default story;
