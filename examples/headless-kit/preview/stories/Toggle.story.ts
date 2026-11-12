import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Inputs',
  slots: { default: { kind: 'text', value: 'Bold' } },
  scenarios: [
    {
      id: 'controlled',
      label: 'Controlled',
      props: { pressed: true },
      description:
        "The story owns `pressed`: a click in any pane reports `onPressedChange`, which becomes the story's prop, so every pane follows.",
    },
    {
      id: 'disabled',
      label: 'Disabled',
      props: { disabled: true, defaultPressed: true },
      description: '`disabled` sets the native attribute and `data-disabled`.',
    },
  ],
};
export default story;
