import { defineTemplate } from '@js-template-engine/types';
import {
  COLOR_TYPE,
  SIZE_TYPE,
  SIZES,
  colorVariables,
  modifiersFor,
  when,
} from '../template-helpers/kit';

export default defineTemplate({
  type: 'component',
  name: 'Badge',
  description:
    'A small status label with size, color, variant and radius props.',
  props: {
    size: { type: SIZE_TYPE, default: 'md' },
    color: { type: COLOR_TYPE, default: 'blue' },
    variant: {
      type: "'filled' | 'light' | 'outline' | 'dot'",
      default: 'filled',
    },
    radius: { type: SIZE_TYPE, default: 'xl' },
  },
  children: [
    {
      type: 'element',
      tag: 'span',
      passthrough: true,
      extensions: { bem: { block: 'mk-badge' } },
      attributes: {
        style: {
          ...colorVariables('badge'),
          '--badge-radius': { $expression: '`var(--mk-radius-${radius})`' },
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25em',
          paddingInline: '0.75em',
          height: '1.6em',
          fontSize: '0.75rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
          borderRadius: 'var(--badge-radius)',
          border: '1px solid transparent',
          background: 'var(--badge-color)',
          color: 'var(--mk-color-white)',
          '&.mk-badge--xs': { fontSize: '0.5625rem' },
          '&.mk-badge--sm': { fontSize: '0.625rem' },
          '&.mk-badge--lg': { fontSize: '0.875rem' },
          '&.mk-badge--xl': { fontSize: '1rem' },
          '&.mk-badge--light': {
            background: 'var(--badge-light)',
            color: 'var(--badge-color)',
          },
          '&.mk-badge--outline': {
            background: 'transparent',
            borderColor: 'var(--badge-color)',
            color: 'var(--badge-color)',
          },
          '&.mk-badge--dot': {
            background: 'transparent',
            borderColor: 'var(--mk-color-default-border)',
            color: 'var(--mk-color-text)',
          },
        },
      },
      conditionalAttributes: [
        ...modifiersFor('mk-badge', 'size', SIZES),
        ...modifiersFor('mk-badge', 'variant', [
          'filled',
          'light',
          'outline',
          'dot',
        ]),
      ],
      children: [
        when("variant === 'dot'", {
          type: 'element',
          tag: 'span',
          extensions: { bem: { element: 'dot' } },
          attributes: {
            style: {
              width: '0.5em',
              height: '0.5em',
              borderRadius: '50%',
              background: 'var(--badge-color)',
            },
          },
        }),
        when('leftSection', {
          type: 'element',
          tag: 'span',
          extensions: { bem: { element: 'section' } },
          children: [{ type: 'slot', name: 'leftSection' }],
        }),
        {
          type: 'element',
          tag: 'span',
          extensions: { bem: { element: 'label' } },
          children: [{ type: 'slot' }],
        },
      ],
    },
  ],
});
