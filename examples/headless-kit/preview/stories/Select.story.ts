import type { Story } from '@scaffold-ui-kit/preview/types';

const options = [
  { value: 'react', label: 'React' },
  { value: 'vue', label: 'Vue' },
  { value: 'svelte', label: 'Svelte' },
  { value: 'solid', label: 'Solid', disabled: true },
];

const story: Story = {
  category: 'Inputs',
  defaultProps: { options, label: 'Framework', placeholder: 'Pick one' },
  scenarios: [
    { id: 'open', label: 'Open', props: { defaultOpen: true } },
    { id: 'preselected', label: 'Preselected', props: { defaultValue: 'vue' } },
    {
      id: 'no-label',
      label: 'Named by aria-label',
      props: { label: null, 'aria-label': 'Framework' },
    },
    { id: 'controlled', label: 'Controlled', props: { value: 'svelte' } },
    { id: 'disabled', label: 'Disabled', props: { disabled: true } },
  ],
};
export default story;
