import type { Story } from '@scaffold-ui-kit/preview/types';

// The default slot is scoped: the fill renders an indicator from the exposed state.
const story: Story = {
  category: 'Inputs',
  slots: {
    default: {
      kind: 'scoped',
      slot: { react: 'children', vue: 'default', svelte: 'children' },
      parameters: ['state'],
      react: '<span data-part="indicator">{state}</span>',
      vue: '<span data-part="indicator">{{ state }}</span>',
      svelte: '<span data-part="indicator">{state}</span>',
    },
  },
  scenarios: [
    {
      id: 'indeterminate',
      label: 'Indeterminate',
      props: { defaultChecked: 'indeterminate' },
      description:
        'Uncontrolled, starting mixed: `aria-checked="mixed"` and `data-state="indeterminate"`. A click checks it.',
    },
    {
      id: 'controlled',
      label: 'Controlled (mixed)',
      props: { checked: 'indeterminate' },
      description:
        'The story owns `checked`, starting mixed; a click in any pane checks all three.',
    },
  ],
};
export default story;
