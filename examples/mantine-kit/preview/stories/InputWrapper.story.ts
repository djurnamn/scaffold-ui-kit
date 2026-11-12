import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Inputs',
  defaultProps: {
    inputId: 'wrapped-control',
    label: 'Custom control',
    description: 'Any control can sit in the wrapper.',
    error: 'And it gets an error line',
  },
  controls: { classNames: false, styles: false },
  slots: {
    default: {
      kind: 'html',
      tag: 'select',
      props: {
        id: 'wrapped-control',
        'aria-describedby': 'wrapped-control-description wrapped-control-error',
      },
      children: {
        kind: 'html',
        tag: 'option',
        children: { kind: 'text', value: 'A native select' },
      },
    },
  },
};
export default story;
