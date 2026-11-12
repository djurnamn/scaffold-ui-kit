import { defineTemplate } from '@js-template-engine/types';
import {
  COLOR_TYPE,
  SIZE_TYPE,
  SIZES,
  modifiersFor,
  part,
  stylesApiProps,
  when,
} from '../template-helpers/kit';

export default defineTemplate({
  type: 'component',
  name: 'Checkbox',
  description:
    'A checkbox with label, description and error, `indeterminate`, and size, color and radius props. Controlled with `checked` + `onCheckedChange`, or uncontrolled with `defaultChecked`. Non-prop attributes (`name`, `value`, `aria-*`, handlers, ...) land on the `<input>`; `class`, `style` and `data-*` on the root, as in Mantine.',
  props: {
    label: { type: 'string' },
    description: { type: 'string' },
    error: { type: 'string' },
    checked: {
      type: 'boolean',
      description:
        'The checked state (controlled). Leave it out to let the checkbox keep its own.',
      bindable: {
        current: 'isChecked',
        setter: 'setChecked',
        defaultProp: 'defaultChecked',
        changeProp: 'onCheckedChange',
      },
    },
    defaultChecked: {
      type: 'boolean',
      default: false,
      description: 'The initial checked state (uncontrolled).',
    },
    indeterminate: {
      type: 'boolean',
      description:
        'Shows the mixed state (controlled). A click clears it and reports `false` through `onIndeterminateChange`.',
      bindable: {
        current: 'isIndeterminate',
        setter: 'setIndeterminate',
        defaultProp: 'defaultIndeterminate',
        changeProp: 'onIndeterminateChange',
      },
    },
    defaultIndeterminate: {
      type: 'boolean',
      default: false,
      description: 'The initial mixed state (uncontrolled).',
    },
    disabled: { type: 'boolean', default: false },
    id: { type: 'string', description: 'The input id; generated when absent.' },
    size: { type: SIZE_TYPE, default: 'sm' },
    color: { type: COLOR_TYPE, default: 'blue' },
    radius: { type: SIZE_TYPE, default: 'sm' },
    labelPosition: { type: "'left' | 'right'", default: 'right' },
    ...stylesApiProps([
      'root',
      'body',
      'inner',
      'input',
      'icon',
      'labelWrapper',
      'label',
      'description',
      'error',
    ]),
    onCheckedChange: {
      type: '(checked: boolean) => void',
      description: 'Called with the new checked state.',
    },
    onIndeterminateChange: {
      type: '(indeterminate: boolean) => void',
      description: 'Called with `false` when a click clears the mixed state.',
    },
  },
  script:
    'function handleChange(event: { currentTarget: EventTarget | null }) {\n  setChecked((event.currentTarget as HTMLInputElement).checked);\n  setIndeterminate(false);\n}',
  ids: { inputId: { prefix: 'mk-checkbox', prop: 'id' } },
  extensions: { vue: { model: 'checked' } },
  children: [
    {
      type: 'element',
      tag: 'div',
      passthrough: true,
      extensions: { bem: { block: 'mk-checkbox' } },
      attributes: {
        ...part('root', {
          '--checkbox-size': {
            $expression: '`calc(var(--mk-control-height-${size}) / 1.75)`',
          },
          '--checkbox-color': {
            $expression: '`var(--mk-color-${color}-filled)`',
          },
          '--checkbox-radius': { $expression: '`var(--mk-radius-${radius})`' },
          fontSize: 'var(--mk-font-size-sm)',
        }),
      },
      conditionalAttributes: [
        ...modifiersFor('mk-checkbox', 'size', SIZES),
        { condition: 'error', attributes: { class: ['mk-checkbox--error'] } },
        {
          condition: "labelPosition === 'left'",
          attributes: { class: ['mk-checkbox--label-left'] },
        },
      ],
      children: [
        {
          type: 'element',
          tag: 'div',
          extensions: { bem: { element: 'body' } },
          attributes: {
            ...part('body', {
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'flex-start',
              '.mk-checkbox--label-left &': {
                flexDirection: 'row-reverse',
                justifyContent: 'flex-end',
              },
            }),
          },
          children: [
            {
              type: 'element',
              tag: 'div',
              extensions: { bem: { element: 'inner' } },
              attributes: {
                ...part('inner', {
                  position: 'relative',
                  width: 'var(--checkbox-size)',
                  height: 'var(--checkbox-size)',
                  flexShrink: 0,
                }),
              },
              children: [
                {
                  type: 'element',
                  tag: 'input',
                  // Mantine: class, style and data-* stay on the root; every other consumer attribute lands here.
                  passthrough: { attributes: ['*'], handle: 'routed' },
                  extensions: { bem: { element: 'input' } },
                  attributes: {
                    type: 'checkbox',
                    id: { $expression: 'inputId' },
                    checked: { $expression: 'isChecked' },
                    indeterminate: { $expression: 'isIndeterminate' },
                    // Also an attribute, so the CSS shows the state where no script sets the property.
                    'data-indeterminate': {
                      $expression: 'isIndeterminate || undefined',
                    },
                    disabled: { $expression: 'disabled' },
                    'aria-invalid': { $expression: 'error ? true : undefined' },
                    'aria-describedby': {
                      $expression:
                        "[description ? `${inputId}-description` : '', error ? `${inputId}-error` : ''].filter(Boolean).join(' ') || undefined",
                    },
                    ...part('input', {
                      appearance: 'none',
                      margin: 0,
                      width: '100%',
                      height: '100%',
                      cursor: 'pointer',
                      border: '1px solid var(--mk-color-default-border)',
                      borderRadius: 'var(--checkbox-radius)',
                      background: 'var(--mk-color-body)',
                      ':checked': {
                        background: 'var(--checkbox-color)',
                        borderColor: 'var(--checkbox-color)',
                      },
                      ':indeterminate, &[data-indeterminate]': {
                        background: 'var(--checkbox-color)',
                        borderColor: 'var(--checkbox-color)',
                      },
                      ':focus-visible': {
                        outline: '2px solid var(--checkbox-color)',
                        outlineOffset: '2px',
                      },
                      ':disabled': { cursor: 'not-allowed', opacity: 0.6 },
                      '.mk-checkbox--error &': {
                        borderColor: 'var(--mk-color-error)',
                      },
                    }),
                  },
                  events: [{ name: 'change', handler: 'handleChange' }],
                },
                {
                  type: 'element',
                  tag: 'span',
                  extensions: { bem: { element: 'icon' } },
                  attributes: {
                    'aria-hidden': 'true',
                    ...part('icon', {
                      position: 'absolute',
                      inset: 0,
                      display: 'grid',
                      placeItems: 'center',
                      pointerEvents: 'none',
                      color: 'var(--mk-color-white)',
                      fontSize: 'calc(var(--checkbox-size) * 0.7)',
                      lineHeight: 1,
                      opacity: 0,
                      ':is(:checked, :indeterminate, [data-indeterminate]) + &':
                        { opacity: 1 },
                    }),
                  },
                  children: [
                    { type: 'text', expression: "isIndeterminate ? '−' : '✓'" },
                  ],
                },
              ],
            },
            {
              type: 'element',
              tag: 'div',
              extensions: { bem: { element: 'label-wrapper' } },
              attributes: {
                ...part('labelWrapper', {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.125rem',
                }),
              },
              children: [
                when('label', {
                  type: 'element',
                  tag: 'label',
                  extensions: { bem: { element: 'label' } },
                  attributes: {
                    for: { $expression: 'inputId' },
                    ...part('label', { cursor: 'pointer' }),
                  },
                  children: [{ type: 'text', expression: 'label' }],
                }),
                when('description', {
                  type: 'element',
                  tag: 'p',
                  extensions: { bem: { element: 'description' } },
                  attributes: {
                    id: { $expression: '`${inputId}-description`' },
                    ...part('description', {
                      margin: 0,
                      color: 'var(--mk-color-dimmed)',
                      fontSize: '0.875em',
                    }),
                  },
                  children: [{ type: 'text', expression: 'description' }],
                }),
                when('error', {
                  type: 'element',
                  tag: 'p',
                  extensions: { bem: { element: 'error' } },
                  attributes: {
                    id: { $expression: '`${inputId}-error`' },
                    ...part('error', {
                      margin: 0,
                      color: 'var(--mk-color-error)',
                      fontSize: '0.875em',
                    }),
                  },
                  children: [{ type: 'text', expression: 'error' }],
                }),
              ],
            },
          ],
        },
      ],
    },
  ],
});
