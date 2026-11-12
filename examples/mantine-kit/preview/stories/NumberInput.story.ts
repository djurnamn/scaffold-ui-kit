import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Inputs',
  defaultProps: {
    label: 'Seats',
    description: 'Between 1 and 10.',
    min: 1,
    max: 10,
    defaultValue: 3,
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
        'The story owns `value`: a control click, an arrow key or typing in any pane writes it back through `onValueChange`. At 10 the increment control disables (a derived value, written once).',
      props: { value: 9 },
    },
    {
      id: 'decimal-step',
      label: 'Decimal step',
      description:
        "`step={0.25}` with no bounds: the controls round to the step's decimals, so 0.1 + 0.2 never shows.",
      props: {
        label: 'Weight (kg)',
        description: 'Steps of 0.25.',
        min: null,
        max: null,
        step: 0.25,
        defaultValue: 1.5,
      },
    },
    {
      id: 'at-max',
      label: 'At max',
      description:
        'The html reference evaluates the derived `canIncrement` too.',
      props: { defaultValue: 10 },
    },
    {
      id: 'no-value',
      label: 'No value',
      props: { defaultValue: '', placeholder: 'How many?' },
    },
    {
      id: 'with-error',
      label: 'With error',
      props: {
        error: 'Pick at least one seat',
        defaultValue: '',
        withAsterisk: true,
      },
    },
    {
      id: 'hide-controls',
      label: 'Hide controls',
      props: { hideControls: true },
    },
    {
      id: 'routed',
      label: 'Routed attributes',
      description:
        "`name` and a consumer `aria-describedby` reach the `<input>`; the consumer's id joins the field's own description id. `data-testid` stays on the root.",
      props: {
        name: 'seats',
        'aria-describedby': 'pricing-note',
        'data-testid': 'seats',
      },
    },
    {
      id: 'styles-api',
      label: 'Styles API',
      props: {
        size: 'lg',
        styles: {
          input: { '--input-radius': '999px' },
          controls: { width: '2rem' },
          control: { color: 'var(--mk-color-grape-filled)' },
        },
      },
    },
  ],
};
export default story;
