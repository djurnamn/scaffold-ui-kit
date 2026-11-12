import type { Story } from '@scaffold-ui-kit/preview/types';

// A story for the browser tests alone: its default slot holds the Faulty
// component, which throws for want of a label.
const story: Story = {
  unlisted: true,
  generate: false,
  slots: {
    default: {
      kind: 'part',
      name: 'FaultyChild',
      parameters: [],
      react: '<Faulty />',
      vue: '<Faulty />',
      svelte: '<Faulty />',
      html: [{ type: 'element', tag: 'Faulty' }],
      imports: ['Faulty'],
    },
  },
};

export default story;
