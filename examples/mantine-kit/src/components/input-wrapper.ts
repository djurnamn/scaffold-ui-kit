import { defineTemplate } from '@js-template-engine/types';
import { SIZE_TYPE, part, stylesApiProps, when } from '../template-helpers/kit';

/**
 * Modeled on Mantine's Input.Wrapper: label, description and error around any control, with the ids a
 * control needs to point aria-describedby at them. The control goes in the default slot.
 */
export default defineTemplate({
  type: 'component',
  name: 'InputWrapper',
  description:
    'Label, description and error around a form control (the default slot). Give the control `id={inputId}` and `aria-describedby` built from `${inputId}-description` / `${inputId}-error`.',
  props: {
    inputId: {
      type: 'string',
      required: true,
      description: 'The id of the control in the default slot.',
    },
    label: { type: 'string' },
    description: { type: 'string' },
    error: { type: 'string' },
    required: { type: 'boolean', default: false },
    withAsterisk: { type: 'boolean' },
    size: { type: SIZE_TYPE, default: 'sm' },
    ...stylesApiProps(['root', 'label', 'required', 'description', 'error']),
  },
  children: [
    {
      type: 'element',
      tag: 'div',
      passthrough: true,
      extensions: { bem: { block: 'mk-input-wrapper' } },
      attributes: {
        class: [{ $expression: 'classNames?.root' }],
        style: {
          '--input-font-size': { $expression: '`var(--mk-font-size-${size})`' },
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          fontSize: 'var(--input-font-size)',
          $expression: 'styles?.root',
        },
      },
      conditionalAttributes: [
        {
          condition: 'error',
          attributes: { class: ['mk-input-wrapper--error'] },
        },
      ],
      children: [
        when('label', {
          type: 'element',
          tag: 'label',
          extensions: { bem: { element: 'label' } },
          attributes: {
            for: { $expression: 'inputId' },
            ...part('label', { fontWeight: 500 }),
          },
          children: [
            { type: 'text', expression: 'label' },
            when('withAsterisk ?? required', {
              type: 'element',
              tag: 'span',
              extensions: { bem: { element: 'required' } },
              attributes: {
                'aria-hidden': 'true',
                ...part('required', {
                  color: 'var(--mk-color-error)',
                  marginInlineStart: '0.25rem',
                }),
              },
              children: [{ type: 'text', content: '*' }],
            }),
          ],
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
        { type: 'slot' },
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
});
