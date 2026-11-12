import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Inputs',
  defaultProps: {
    label: 'Wi-Fi',
    description: 'Click the track or the label.',
  },
  controls: {
    classNames: false,
    styles: false,
    onCheckedChange: false,
    id: false,
  },
  scenarios: [
    { id: 'on', label: 'On (uncontrolled)', props: { defaultChecked: true } },
    {
      id: 'controlled',
      label: 'Controlled',
      description:
        'The story owns `checked`: a click in any pane writes back through `onCheckedChange`, so every pane, the control and the address follow.',
      props: { checked: true, onLabel: 'on', offLabel: 'off' },
    },
    {
      id: 'track-labels',
      label: 'Track labels',
      props: { onLabel: 'on', offLabel: 'off', size: 'lg', color: 'green' },
    },
    {
      id: 'with-error',
      label: 'With error',
      props: { error: 'Required for sync', defaultChecked: false },
    },
    { id: 'label-left', label: 'Label left', props: { labelPosition: 'left' } },
    {
      id: 'styles-api',
      label: 'Styles API',
      description:
        '`styles.thumb` and `styles.track` restyle the parts; `radius="xs"` squares them.',
      props: {
        radius: 'xs',
        color: 'grape',
        styles: {
          thumb: { background: 'var(--mk-color-grape-light)' },
          track: { borderWidth: '2px' },
        },
      },
    },
  ],
};
export default story;
