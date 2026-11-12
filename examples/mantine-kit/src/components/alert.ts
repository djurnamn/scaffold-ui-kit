import { defineTemplate } from '@js-template-engine/types';
import {
  COLOR_TYPE,
  SIZE_TYPE,
  colorVariables,
  modifiersFor,
  when,
} from '../template-helpers/kit';

export default defineTemplate({
  type: 'component',
  name: 'Alert',
  description:
    'A callout with a title, an optional icon, and an optional close button that fires `onClose`.',
  props: {
    title: { type: 'string' },
    color: { type: COLOR_TYPE, default: 'blue' },
    variant: { type: "'filled' | 'light' | 'outline'", default: 'light' },
    radius: { type: SIZE_TYPE, default: 'sm' },
    withCloseButton: { type: 'boolean', default: false },
    closeButtonLabel: { type: 'string', default: 'Close alert' },
    onClose: { type: '() => void' },
    role: {
      type: "'alert' | 'status' | 'note'",
      default: 'alert',
      description:
        "The callout's role. `alert` makes it an assertive live region, for a message that appears in response to something; give `note` or `status` for a callout that is part of the page.",
    },
  },
  children: [
    {
      type: 'element',
      tag: 'div',
      passthrough: true,
      extensions: { bem: { block: 'mk-alert' } },
      attributes: {
        role: { $expression: 'role' },
        style: {
          ...colorVariables('alert'),
          '--alert-radius': { $expression: '`var(--mk-radius-${radius})`' },
          display: 'flex',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--alert-radius)',
          border: '1px solid transparent',
          background: 'var(--alert-light)',
          color: 'var(--mk-color-text)',
          '&.mk-alert--filled': {
            background: 'var(--alert-color)',
            color: 'var(--mk-color-white)',
          },
          '&.mk-alert--outline': {
            background: 'transparent',
            borderColor: 'var(--alert-color)',
          },
        },
      },
      conditionalAttributes: modifiersFor('mk-alert', 'variant', [
        'filled',
        'light',
        'outline',
      ]),
      children: [
        when('icon', {
          type: 'element',
          tag: 'div',
          extensions: { bem: { element: 'icon' } },
          attributes: { style: { color: 'var(--alert-color)', lineHeight: 1 } },
          children: [{ type: 'slot', name: 'icon' }],
        }),
        {
          type: 'element',
          tag: 'div',
          extensions: { bem: { element: 'body' } },
          attributes: {
            style: {
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            },
          },
          children: [
            when('title', {
              type: 'element',
              tag: 'div',
              extensions: { bem: { element: 'title' } },
              attributes: { style: { fontWeight: 700 } },
              children: [{ type: 'text', expression: 'title' }],
            }),
            {
              type: 'element',
              tag: 'div',
              extensions: { bem: { element: 'message' } },
              attributes: { style: { fontSize: '0.875rem' } },
              children: [{ type: 'slot' }],
            },
          ],
        },
        when('withCloseButton', {
          type: 'element',
          tag: 'button',
          extensions: { bem: { element: 'close' } },
          attributes: {
            type: 'button',
            'aria-label': { $expression: 'closeButtonLabel' },
            style: {
              alignSelf: 'flex-start',
              border: 0,
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '1rem',
              lineHeight: 1,
              ':hover': { opacity: 0.7 },
            },
          },
          events: [{ name: 'click', handler: 'onClose' }],
          children: [{ type: 'text', content: '×' }],
        }),
      ],
    },
  ],
});
