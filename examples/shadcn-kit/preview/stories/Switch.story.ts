import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Inputs',
  defaultProps: { 'aria-label': 'Airplane mode' },
  controls: { onCheckedChange: false },
  scenarios: [
    {
      id: 'checked',
      label: 'On (controlled)',
      props: { checked: true },
      description:
        'A given `checked`: a click in any pane moves every pane. Vue binds it with a bare `v-model`.',
    },
    {
      id: 'uncontrolled',
      label: 'On at first',
      props: { defaultChecked: true },
      description: 'Only `defaultChecked`: each pane keeps its own state.',
    },
    {
      id: 'disabled',
      label: 'Disabled',
      props: { defaultChecked: true, disabled: true },
    },
    {
      id: 'dark',
      label: 'On, dark',
      props: { checked: true },
      options: { mode: true },
    },
  ],
};
export default story;
