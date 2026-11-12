import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Inputs',
  defaultProps: {
    data: [
      { label: 'React', value: 'react' },
      { label: 'Vue', value: 'vue' },
      { label: 'Svelte', value: 'svelte' },
    ],
    // Uncontrolled by default with a selection, as Mantine's always has one; the controlled story's code leaves it out.
    defaultValue: 'vue',
  },
  scenarios: [
    {
      id: 'controlled',
      label: 'Controlled',
      description:
        'The story owns `value`: a click in any pane writes it back through `onChange`, so every pane follows.',
      props: { value: 'svelte' },
    },
  ],
};
export default story;
