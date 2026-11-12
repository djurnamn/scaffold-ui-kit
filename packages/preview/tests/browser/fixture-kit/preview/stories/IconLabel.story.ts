import type { Story } from '@scaffold-ui-kit/preview/types';

// A named default scenario: the picker shows "Icon and label (default)" and
// selects it first; "Icon only" clears the label.
const story: Story = {
  generate: false,
  slots: { named: { icon: { kind: 'element', component: 'Dot' } } },
  scenarios: [
    { id: 'icon-and-label', label: 'Icon and label', default: true },
    { id: 'icon-only', label: 'Icon only', props: { label: '' } },
  ],
};

export default story;
