import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Inputs',
  defaultProps: { placeholder: 'Email', 'aria-label': 'Email', class: 'w-72' },
  controls: { onValueChange: false },
  scenarios: [
    {
      id: 'controlled',
      label: 'Controlled',
      props: { value: 'ada@example.com' },
      description:
        'A given `value`: typing in any pane moves every pane. React binds `value`/`onValueChange`, Vue a bare `v-model`, Svelte `bind:value`.',
    },
    {
      id: 'disabled',
      label: 'Disabled',
      props: { defaultValue: 'read only', disabled: true },
    },
  ],
};
export default story;
