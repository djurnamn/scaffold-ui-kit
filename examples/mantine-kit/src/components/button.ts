import { defineTemplate } from '@js-template-engine/types';
import {
  COLOR_TYPE,
  SIZE_TYPE,
  SIZES,
  modifiersFor,
  stylesApiProps,
  when,
} from '../template-helpers/kit';

const VARIANTS = ['filled', 'light', 'outline', 'subtle'] as const;

export default defineTemplate({
  type: 'component',
  name: 'Button',
  description:
    'A Mantine-style button: size, variant, color and radius props, a loading state, and left/right sections.',
  props: {
    size: { type: SIZE_TYPE, default: 'sm' },
    variant: {
      type: VARIANTS.map((variant) => `'${variant}'`).join(' | '),
      default: 'filled',
    },
    color: { type: COLOR_TYPE, default: 'blue' },
    radius: { type: SIZE_TYPE, default: 'sm' },
    loading: { type: 'boolean', default: false },
    disabled: { type: 'boolean', default: false },
    fullWidth: { type: 'boolean', default: false },
    type: {
      type: "'button' | 'submit' | 'reset'",
      default: 'button',
      description:
        'The native button type; `button` unless you need a form submit. Ignored when rendered as a link.',
    },
    component: {
      type: "'button' | 'a'",
      description:
        "The element to render (Mantine's polymorphic `component`): `a` takes `href` and an anchor ref.",
      documentedDefault: "'button'",
    },
    ...stylesApiProps(['root', 'inner', 'section', 'label', 'loader']),
  },
  children: [
    {
      type: 'element',
      tag: { $expression: "component ?? 'button'", default: 'button' },
      passthrough: true,
      extensions: { bem: { block: 'mk-button' } },
      attributes: {
        type: { $expression: "component === 'a' ? undefined : type" },
        class: [{ $expression: 'classNames?.root' }],
        disabled: {
          $expression: "component === 'a' ? undefined : disabled || loading",
        },
        'aria-disabled': {
          $expression:
            "component === 'a' && (disabled || loading) ? true : undefined",
        },
        // A loading button is disabled, so it takes no clicks, and busy, so
        // assistive technology announces why.
        'aria-busy': { $expression: 'loading || undefined' },
        'data-loading': { $expression: 'loading || undefined' },
        style: {
          '--button-color': {
            $expression: '`var(--mk-color-${color}-filled)`',
          },
          '--button-hover': {
            $expression: '`var(--mk-color-${color}-filled-hover)`',
          },
          '--button-light': { $expression: '`var(--mk-color-${color}-light)`' },
          '--button-radius': { $expression: '`var(--mk-radius-${radius})`' },
          '--button-height': {
            $expression: '`var(--mk-control-height-${size})`',
          },
          '--button-font-size': {
            $expression: '`var(--mk-font-size-${size})`',
          },
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'var(--button-height)',
          paddingInline: 'calc(var(--button-height) / 2.5)',
          fontSize: 'var(--button-font-size)',
          fontFamily: 'inherit',
          fontWeight: 600,
          borderRadius: 'var(--button-radius)',
          border: '1px solid transparent',
          cursor: 'pointer',
          background: 'var(--button-color)',
          color: 'var(--mk-color-white)',
          ':hover': { background: 'var(--button-hover)' },
          ':disabled': { cursor: 'not-allowed', opacity: 0.6 },
          '&.mk-button--light': {
            background: 'var(--button-light)',
            color: 'var(--button-color)',
          },
          '&.mk-button--outline': {
            background: 'transparent',
            borderColor: 'var(--button-color)',
            color: 'var(--button-color)',
          },
          '&.mk-button--subtle': {
            background: 'transparent',
            color: 'var(--button-color)',
          },
          '&.mk-button--full-width': { display: 'flex', width: '100%' },
          $expression: 'styles?.root',
        },
      },
      conditionalAttributes: [
        ...modifiersFor('mk-button', 'variant', VARIANTS),
        ...modifiersFor('mk-button', 'size', SIZES),
        {
          condition: 'fullWidth',
          attributes: { class: ['mk-button--full-width'] },
        },
        { condition: 'loading', attributes: { class: ['mk-button--loading'] } },
      ],
      children: [
        when('loading', {
          type: 'element',
          tag: 'span',
          extensions: { bem: { element: 'loader' } },
          attributes: {
            class: [{ $expression: 'classNames?.loader' }],
            'aria-hidden': 'true',
            style: {
              position: 'absolute',
              width: '1em',
              height: '1em',
              border: '2px solid currentColor',
              borderRightColor: 'transparent',
              borderRadius: '50%',
              animation: 'mk-spin 0.7s linear infinite',
              $expression: 'styles?.loader',
            },
          },
        }),
        {
          type: 'element',
          tag: 'span',
          extensions: { bem: { element: 'inner' } },
          attributes: {
            class: [{ $expression: 'classNames?.inner' }],
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              $expression: 'styles?.inner',
            },
          },
          conditionalAttributes: [
            {
              condition: 'loading',
              attributes: { class: ['mk-button__inner--hidden'] },
            },
          ],
          children: [
            when('leftSection', {
              type: 'element',
              tag: 'span',
              extensions: { bem: { element: 'section', modifiers: ['left'] } },
              attributes: {
                class: [{ $expression: 'classNames?.section' }],
                style: { $expression: 'styles?.section' },
                'data-position': 'left',
              },
              children: [{ type: 'slot', name: 'leftSection' }],
            }),
            {
              type: 'element',
              tag: 'span',
              extensions: { bem: { element: 'label' } },
              attributes: {
                class: [{ $expression: 'classNames?.label' }],
                style: { $expression: 'styles?.label' },
              },
              children: [{ type: 'slot' }],
            },
            when('rightSection', {
              type: 'element',
              tag: 'span',
              extensions: { bem: { element: 'section', modifiers: ['right'] } },
              attributes: {
                class: [{ $expression: 'classNames?.section' }],
                style: { $expression: 'styles?.section' },
                'data-position': 'right',
              },
              children: [{ type: 'slot', name: 'rightSection' }],
            }),
          ],
        },
      ],
    },
  ],
  // `opacity: 0` hides the label while loading; `visibility: hidden` would also
  // take it out of the accessibility tree and leave the button with no name.
  style:
    '@keyframes mk-spin {\n  to { transform: rotate(360deg); }\n}\n.mk-button__inner--hidden { opacity: 0; }',
});
