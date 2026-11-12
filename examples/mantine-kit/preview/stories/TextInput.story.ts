import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Inputs',
  defaultProps: {
    label: 'Email',
    placeholder: 'you@example.com',
    description: 'We never share it.',
  },
  controls: {
    classNames: false,
    styles: false,
    onValueChange: false,
    id: false,
  },
  scenarios: [
    {
      id: 'controlled',
      label: 'Controlled',
      description:
        'The story owns `value`; typing in any pane writes it back through `onValueChange`.',
      props: { value: 'hello@example.com' },
    },
    { id: 'required', label: 'Required', props: { required: true } },
    {
      id: 'with-error',
      label: 'With error',
      props: { error: 'Invalid email', defaultValue: 'nope' },
    },
    { id: 'disabled', label: 'Disabled', props: { disabled: true } },
    {
      id: 'styles-api',
      label: 'Styles API',
      description:
        'Inner parts targeted by name: `classNames.label` and `styles.{root,label,input,description}`.',
      props: {
        classNames: { label: 'demo-label' },
        styles: {
          root: {
            padding: '0.75rem',
            border: '1px dashed var(--mk-color-grape-filled)',
            borderRadius: '8px',
          },
          label: {
            color: 'var(--mk-color-grape-filled)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          },
          input: {
            '--input-radius': '999px',
            borderColor: 'var(--mk-color-grape-filled)',
          },
          description: { fontStyle: 'italic' },
        },
      },
    },
  ],
};
export default story;
