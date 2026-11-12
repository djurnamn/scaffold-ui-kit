import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Inputs',
  slots: { default: { kind: 'text', value: 'Airplane mode' } },
  scenarios: [
    {
      id: 'controlled',
      label: 'Controlled',
      props: { checked: true },
      description:
        'The story owns `checked`; a click in any pane flips all three. In Vue this is the prop a bare `v-model` binds.',
    },
    {
      id: 'in-a-form',
      label: 'In a form',
      props: { name: 'newsletter', defaultChecked: true },
      description:
        'While on, a hidden `<input name="newsletter" value="on">` follows the button, so the switch submits with its form.',
    },
  ],
};
export default story;
