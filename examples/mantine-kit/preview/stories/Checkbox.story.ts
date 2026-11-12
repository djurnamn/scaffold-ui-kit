import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Inputs',
  defaultProps: {
    label: 'I agree to the terms',
    description: 'You can change this later.',
  },
  controls: {
    classNames: false,
    styles: false,
    onCheckedChange: false,
    onIndeterminateChange: false,
    defaultIndeterminate: false,
    id: false,
  },
  // The hint the joined-ids scenario's aria-describedby names, rendered
  // after the checkbox in every pane and in its code.
  around: {
    after: {
      kind: 'html',
      tag: 'small',
      props: { id: 'terms-hint' },
      children: { kind: 'text', value: 'Read the terms before you agree.' },
    },
  },
  scenarios: [
    {
      id: 'default-checked',
      label: 'Checked (uncontrolled)',
      props: { defaultChecked: true },
    },
    {
      id: 'controlled',
      label: 'Controlled',
      description:
        'The story owns `checked`; clicks in any pane write it back through `onCheckedChange`.',
      props: { checked: false },
    },
    {
      id: 'joined-ids',
      label: 'Description and outside hint',
      description:
        "A consumer's `aria-describedby` joins the field's own description and error ids on the `<input>`, the field's first. It names the hint the story renders after the checkbox.",
      props: { error: 'You must agree', 'aria-describedby': 'terms-hint' },
    },
    {
      id: 'with-error',
      label: 'With error',
      props: { error: 'You must agree' },
    },
    {
      id: 'indeterminate',
      label: 'Indeterminate',
      description:
        'The story owns `indeterminate` and `checked`. A click checks the box and reports `false` through `onIndeterminateChange`, so every pane leaves the mixed state together.',
      props: { indeterminate: true, checked: false, label: 'Select all' },
    },
    {
      id: 'styles-api',
      label: 'Styles API',
      description:
        '`styles.label` and `styles.icon` restyle inner parts without touching the kit CSS.',
      props: {
        color: 'grape',
        styles: { label: { fontWeight: 700 }, icon: { fontSize: '0.6rem' } },
      },
    },
  ],
};
export default story;
