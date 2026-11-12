import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Overlays',
  slots: {
    default: {
      kind: 'fragment',
      children: [
        {
          kind: 'element',
          component: 'TooltipTrigger',
          props: { 'aria-label': 'Save draft' },
          children: { kind: 'text', value: 'Save' },
        },
        {
          kind: 'element',
          component: 'TooltipContent',
          children: { kind: 'text', value: 'Saves the draft. Ctrl+S' },
        },
      ],
    },
  },
  scenarios: [
    {
      id: 'open',
      label: 'Open by default',
      props: { defaultOpen: true },
      description:
        'Uncontrolled, starting open. Escape closes it wherever focus is.',
    },
    {
      id: 'instant',
      label: 'No delay',
      props: { openDelay: 0, closeDelay: 0 },
      description: 'Hover opens and leaving closes at once.',
    },
    {
      id: 'controlled',
      label: 'Controlled',
      props: { open: true },
      description:
        'The story owns `open`; hover, focus and Escape in any pane move all three.',
    },
  ],
};
export default story;
