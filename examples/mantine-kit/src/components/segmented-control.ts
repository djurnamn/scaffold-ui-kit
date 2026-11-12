import { defineTemplate } from '@js-template-engine/types';
import {
  COLOR_TYPE,
  SIZE_TYPE,
  SIZES,
  modifiersFor,
} from '../template-helpers/kit';

/**
 * Modeled on Mantine's SegmentedControl: each segment is a native radio inside its label, so the
 * group has one tab stop and the arrow keys move the selection, as a radio group's do.
 */
export default defineTemplate({
  type: 'component',
  name: 'SegmentedControl',
  description:
    'A row of segments that picks one value, built on native radios: one tab stop, arrow keys move the selection. Controlled with `value` + `onChange` (`v-model`, `bind:value`), or uncontrolled with `defaultValue`.',
  props: {
    data: {
      type: 'Array<{ label: string; value: string; disabled?: boolean }>',
      required: true,
    },
    value: {
      type: 'string',
      description:
        'The selected value (controlled). Leave it out to let the control keep its own.',
      bindable: {
        current: 'current',
        setter: 'select',
        defaultProp: 'defaultValue',
        changeProp: 'onChange',
      },
    },
    defaultValue: {
      type: 'string',
      description: 'The initially selected value (uncontrolled).',
    },
    name: {
      type: 'string',
      description: 'The `name` every radio shares; generated when absent.',
    },
    size: { type: SIZE_TYPE, default: 'sm' },
    color: { type: COLOR_TYPE },
    fullWidth: { type: 'boolean', default: false },
    onChange: {
      type: '(value: string) => void',
      description: 'Called with the newly selected value.',
    },
  },
  ids: { groupName: { prefix: 'mk-segmented-control', prop: 'name' } },
  // A bare v-model binds the selection.
  extensions: { vue: { model: 'value' } },
  children: [
    {
      type: 'element',
      tag: 'div',
      passthrough: true,
      extensions: { bem: { block: 'mk-segmented-control' } },
      attributes: {
        role: 'radiogroup',
        style: {
          '--segmented-control-active': {
            $expression:
              "color ? `var(--mk-color-${color}-filled)` : 'var(--mk-color-body)'",
          },
          '--segmented-control-active-text': {
            $expression:
              "color ? 'var(--mk-color-white)' : 'var(--mk-color-text)'",
          },
          display: 'inline-flex',
          padding: '4px',
          gap: '4px',
          borderRadius: 'var(--mk-radius-md)',
          background: 'var(--mk-color-default-border)',
          '&.mk-segmented-control--full-width': { display: 'flex' },
        },
      },
      conditionalAttributes: [
        ...modifiersFor('mk-segmented-control', 'size', SIZES),
        {
          condition: 'fullWidth',
          attributes: { class: ['mk-segmented-control--full-width'] },
        },
      ],
      children: [
        {
          type: 'iteration',
          items: 'data',
          item: 'item',
          key: 'item.value',
          children: [
            {
              type: 'element',
              tag: 'label',
              extensions: { bem: { element: 'control' } },
              attributes: {
                style: {
                  position: 'relative',
                  flex: 1,
                  padding: '0.25rem 0.75rem',
                  borderRadius: 'var(--mk-radius-sm)',
                  color: 'var(--mk-color-text)',
                  fontWeight: 500,
                  textAlign: 'center',
                  cursor: 'pointer',
                  '&:has(:focus-visible)': {
                    outline: '2px solid var(--mk-color-blue-filled)',
                    outlineOffset: '1px',
                  },
                  '&.mk-segmented-control__control--active': {
                    background: 'var(--segmented-control-active)',
                    color: 'var(--segmented-control-active-text)',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  },
                  '&.mk-segmented-control__control--disabled': {
                    cursor: 'not-allowed',
                    opacity: 0.5,
                  },
                },
              },
              conditionalAttributes: [
                {
                  condition: 'item.value === current',
                  attributes: {
                    class: ['mk-segmented-control__control--active'],
                  },
                },
                {
                  condition: 'item.disabled',
                  attributes: {
                    class: ['mk-segmented-control__control--disabled'],
                  },
                },
              ],
              children: [
                {
                  type: 'element',
                  tag: 'input',
                  extensions: { bem: { element: 'input' } },
                  attributes: {
                    type: 'radio',
                    name: { $expression: 'groupName' },
                    value: { $expression: 'item.value' },
                    checked: { $expression: 'item.value === current' },
                    disabled: { $expression: 'item.disabled' },
                    // Covers the label, invisible: clicks and focus reach the radio.
                    style: {
                      position: 'absolute',
                      inset: 0,
                      margin: 0,
                      opacity: 0,
                      cursor: 'inherit',
                    },
                  },
                  events: [
                    { name: 'change', handler: '() => select(item.value)' },
                  ],
                },
                {
                  type: 'element',
                  tag: 'span',
                  extensions: { bem: { element: 'label' } },
                  children: [{ type: 'text', expression: 'item.label' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});
