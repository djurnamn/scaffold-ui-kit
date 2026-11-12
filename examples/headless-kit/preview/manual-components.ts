import type { ManualComponentSpecification } from '@scaffold-ui-kit/preview/types';

export default (): ManualComponentSpecification[] => [
  {
    name: 'Modal',
    file: 'src/drivers/react/Modal.tsx',
    description: 'A modal dialog driven by a Zag machine.',
    props: {
      open: {
        type: 'boolean',
        description:
          'The open state. Leave it out to let the modal keep its own.',
      },
      defaultOpen: {
        type: 'boolean',
        description: 'The initial open state when uncontrolled.',
      },
      title: { type: 'string', description: 'The visible title.' },
      label: {
        type: 'string',
        description: 'The accessible name when there is no visible title.',
      },
      description: { type: 'string', description: 'The visible description.' },
    },
    hasDefaultSlot: true,
    slotNames: ['trigger'],
  },
  {
    name: 'Select',
    file: 'src/drivers/react/Select.tsx',
    description: 'A single select driven by a Zag machine.',
    props: {
      options: {
        type: 'SelectOption[]',
        required: true,
        description: 'The options.',
      },
      value: { type: 'string', description: 'The selected value.' },
      defaultValue: {
        type: 'string',
        description: 'The initial value when uncontrolled.',
      },
      defaultOpen: {
        type: 'boolean',
        description: 'Open the list on first render.',
      },
      label: { type: 'string', description: 'The visible label.' },
      placeholder: {
        type: 'string',
        description: 'Shown when nothing is selected.',
      },
      disabled: { type: 'boolean', description: 'Whether it is disabled.' },
    },
    hasDefaultSlot: false,
    slotNames: [],
    rest: { tag: 'button' },
  },
];
