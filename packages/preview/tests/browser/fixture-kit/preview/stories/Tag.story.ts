import type { Story } from '@scaffold-ui-kit/preview/types';

// The seeded slot text is what the panes show, and what a test edits first.
const story: Story = {
  slots: { default: { kind: 'text', value: 'Active' } },
  generate: false,
  scenarios: [
    {
      id: 'loud',
      label: 'Loud',
      description: 'The `loud` tone, for a state that needs attention now.',
      props: { tone: 'loud' },
    },
    // A scenario with slot content of its own: its text stands in the
    // default slot in place of the story's.
    {
      id: 'paused',
      label: 'Paused',
      slots: { default: { kind: 'text', value: 'Paused' } },
    },
    // A scenario in a setting: picking it sets the global context and the
    // story's own.
    {
      id: 'on-dark',
      label: 'On dark',
      options: { mode: 'dark', surface: '2', padded: false },
    },
  ],
};

export default story;
