import { defineTemplate } from '@js-template-engine/types';

const OPTION_TYPE =
  'export interface SelectVisualOption {\n  value: string;\n  label: string;\n  disabled?: boolean;\n}';

// The markup of a Zag select. The drivers own the machine and hand the template
// each part's props; `itemProps` returns the props of one option.
export default defineTemplate({
  type: 'component',
  name: 'SelectVisual',
  imports: [OPTION_TYPE],
  description:
    'Markup for `Select`: label, trigger, value, listbox and the hidden native select that submits with a form.',
  props: {
    options: {
      type: 'SelectVisualOption[]',
      required: true,
      description: 'The options to show.',
    },
    label: { type: 'string', description: 'The visible label.' },
    placeholder: {
      type: 'string',
      description: 'Shown when nothing is selected.',
    },
    valueText: {
      type: 'string',
      description: "The selected option's label, when there is one.",
    },
    labelProps: {
      type: 'Record<string, any>',
      description: 'Props for the label.',
    },
    triggerProps: {
      type: 'Record<string, any>',
      description: 'Props for the trigger.',
    },
    valueProps: {
      type: 'Record<string, any>',
      description: 'Props for the value text.',
    },
    positionerProps: {
      type: 'Record<string, any>',
      description: 'Props for the positioner.',
    },
    contentProps: {
      type: 'Record<string, any>',
      description: 'Props for the listbox.',
    },
    hiddenSelectProps: {
      type: 'Record<string, any>',
      description: 'Props for the hidden native select.',
    },
    itemProps: {
      type: '(option: SelectVisualOption) => Record<string, any>',
      required: true,
      description: 'Props for one option.',
    },
    itemState: {
      type: '(option: SelectVisualOption) => boolean',
      required: true,
      description: 'Whether the option is selected.',
    },
  },
  children: [
    {
      type: 'conditional',
      conditions: [
        {
          statement: 'if',
          condition: 'label !== undefined',
          children: [
            {
              type: 'element',
              tag: 'label',
              attributes: { $spread: { $expression: 'labelProps' } },
              children: [{ type: 'text', expression: 'label' }],
            },
          ],
        },
      ],
    },
    {
      type: 'element',
      tag: 'select',
      attributes: { $spread: { $expression: 'hiddenSelectProps' } },
      children: [
        {
          type: 'iteration',
          items: 'options',
          item: 'option',
          key: 'option.value',
          children: [
            {
              type: 'element',
              tag: 'option',
              attributes: { value: { $expression: 'option.value' } },
              children: [{ type: 'text', expression: 'option.label' }],
            },
          ],
        },
      ],
    },
    {
      type: 'element',
      tag: 'button',
      attributes: { $spread: { $expression: 'triggerProps' } },
      children: [
        {
          type: 'element',
          tag: 'span',
          attributes: { $spread: { $expression: 'valueProps' } },
          children: [{ type: 'text', expression: 'valueText ?? placeholder' }],
        },
      ],
    },
    {
      type: 'element',
      tag: 'div',
      attributes: { $spread: { $expression: 'positionerProps' } },
      children: [
        {
          type: 'element',
          tag: 'ul',
          attributes: { $spread: { $expression: 'contentProps' } },
          children: [
            {
              type: 'iteration',
              items: 'options',
              item: 'option',
              key: 'option.value',
              children: [
                {
                  type: 'element',
                  tag: 'li',
                  attributes: {
                    $spread: { $expression: 'itemProps(option)' },
                    'data-state': {
                      $expression:
                        "itemState(option) ? 'checked' : 'unchecked'",
                    },
                  },
                  children: [{ type: 'text', expression: 'option.label' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});
