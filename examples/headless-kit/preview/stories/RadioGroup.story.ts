import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Inputs',
  defaultProps: {
    'aria-label': 'Density',
    defaultValue: 'comfortable',
    options: [
      { value: 'default', label: 'Default' },
      { value: 'comfortable', label: 'Comfortable' },
      { value: 'compact', label: 'Compact', disabled: true },
    ],
  },
  slots: {
    default: {
      kind: 'scoped',
      slot: { react: 'children', vue: 'default', svelte: 'children' },
      parameters: ['option', 'checked'],
      react:
        '<span data-part="label">{option.label}{checked ? " (selected)" : ""}</span>',
      vue: '<span data-part="label">{{ option.label }}{{ checked ? " (selected)" : "" }}</span>',
      svelte:
        '<span data-part="label">{option.label}{checked ? " (selected)" : ""}</span>',
    },
  },
  scenarios: [
    {
      id: 'controlled',
      label: 'Controlled',
      props: { value: 'default' },
      description:
        'The story owns `value`; arrow keys in one pane move every pane.',
    },
    {
      id: 'horizontal',
      label: 'Horizontal',
      props: { orientation: 'horizontal' },
      description:
        '`data-orientation="horizontal"` lays the group out in a row; the arrow keys work either way.',
    },
  ],
};
export default story;
