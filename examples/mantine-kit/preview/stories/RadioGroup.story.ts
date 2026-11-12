import type { Story } from '@scaffold-ui-kit/preview/types';

const radio = (
  value: string,
  label: string,
  props: Record<string, unknown> = {}
) => ({
  kind: 'element' as const,
  component: 'Radio',
  props: { value, label, ...props },
});

const story: Story = {
  category: 'Inputs',
  defaultProps: {
    label: 'Plan',
    description: 'Arrow keys move between the options.',
    name: 'plan',
  },
  controls: { classNames: false, styles: false, onChange: false },
  slots: {
    default: {
      kind: 'fragment',
      children: [
        radio('free', 'Free'),
        radio('team', 'Team'),
        radio('enterprise', 'Enterprise (contact us)', { disabled: true }),
      ],
    },
  },
  scenarios: [
    {
      id: 'uncontrolled',
      label: 'Uncontrolled default',
      props: { defaultValue: 'free' },
    },
    {
      id: 'controlled',
      label: 'Controlled',
      description:
        'The story owns `value`: choosing a radio in any pane writes it back through `onChange`, so every pane follows.',
      props: { value: 'team' },
    },
    {
      id: 'with-error',
      label: 'With error',
      props: { error: 'Pick a plan to continue', withAsterisk: true },
    },
    {
      id: 'styles-api',
      label: 'Styles API',
      description:
        '`styles.options` lays the radios out in a row; `size="lg"` scales the group text.',
      props: {
        size: 'lg',
        defaultValue: 'team',
        styles: { options: { flexDirection: 'row', gap: '1.5rem' } },
      },
    },
  ],
};
export default story;
