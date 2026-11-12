import { defineTemplate } from '@js-template-engine/types';
import {
  COLOR_TYPE,
  SIZES,
  SIZE_TYPE,
  modifiersFor,
  part,
  stylesApiProps,
  when,
} from '../template-helpers/kit';

// Both track labels carry the `mk-switch__track-label` class, so a rule on that
// class would style both labels. Each label's rules are keyed on its own
// modifier class (`--on`, `--off`) instead, and match that label alone.
const TRACK_LABEL_ON_STYLE = {
  '&.mk-switch__track-label--on': {
    display: 'none',
    paddingInlineStart: 'calc(var(--switch-height) * 0.3)',
  },
  ':checked + .mk-switch__track &.mk-switch__track-label--on': {
    display: 'block',
  },
};
const TRACK_LABEL_OFF_STYLE = {
  '&.mk-switch__track-label--off': {
    marginInlineStart: 'auto',
    paddingInlineEnd: 'calc(var(--switch-height) * 0.3)',
  },
  ':checked + .mk-switch__track &.mk-switch__track-label--off': {
    display: 'none',
  },
};

/** Modeled on Mantine's Switch: a checkbox with role="switch" drawn as a track and thumb; on/off labels by CSS. */
export default defineTemplate({
  type: 'component',
  name: 'Switch',
  description:
    'A toggle switch (`<input type="checkbox" role="switch">`) with label, description and error, `onLabel`/`offLabel` inside the track, and size, color and radius props. Controlled with `checked` + `onCheckedChange`, or uncontrolled with `defaultChecked`. Non-prop attributes (`name`, `value`, `aria-*`, handlers, ...) land on the `<input>`; `class`, `style` and `data-*` on the root, as in Mantine.',
  props: {
    label: { type: 'string' },
    description: { type: 'string' },
    error: { type: 'string' },
    checked: {
      type: 'boolean',
      description:
        'The checked state (controlled). Leave it out to let the switch keep its own.',
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
    disabled: { type: 'boolean', default: false },
    id: { type: 'string', description: 'The input id; generated when absent.' },
    size: { type: SIZE_TYPE, default: 'sm' },
    color: { type: COLOR_TYPE, default: 'blue' },
    radius: { type: SIZE_TYPE, default: 'xl' },
    labelPosition: { type: "'left' | 'right'", default: 'right' },
    onLabel: { type: 'string', description: 'Text in the track while on.' },
    offLabel: { type: 'string', description: 'Text in the track while off.' },
    ...stylesApiProps([
      'root',
      'body',
      'track',
      'thumb',
      'trackLabel',
      'input',
      'labelWrapper',
      'label',
      'description',
      'error',
    ]),
    onCheckedChange: {
      type: '(checked: boolean) => void',
      description: 'Called with the new checked state.',
    },
  },
  script:
    'function handleChange(event: { currentTarget: EventTarget | null }) {\n  setChecked((event.currentTarget as HTMLInputElement).checked);\n}',
  ids: { inputId: { prefix: 'mk-switch', prop: 'id' } },
  extensions: { vue: { model: 'checked' } },
  children: [
    {
      type: 'element',
      tag: 'div',
      passthrough: true,
      extensions: { bem: { block: 'mk-switch' } },
      attributes: {
        ...part('root', {
          '--switch-height': {
            $expression:
              "({ xs: '1rem', sm: '1.25rem', md: '1.5rem', lg: '1.875rem', xl: '2.25rem' })[size]",
          },
          '--switch-color': {
            $expression: '`var(--mk-color-${color}-filled)`',
          },
          '--switch-radius': { $expression: '`var(--mk-radius-${radius})`' },
          '--switch-width': 'calc(var(--switch-height) * 1.9)',
          '--switch-thumb-size': 'calc(var(--switch-height) - 4px)',
          fontSize: 'var(--mk-font-size-sm)',
          '&.mk-switch--with-track-labels': {
            '--switch-width': 'calc(var(--switch-height) * 2.6)',
          },
        }),
      },
      conditionalAttributes: [
        ...modifiersFor('mk-switch', 'size', SIZES),
        { condition: 'error', attributes: { class: ['mk-switch--error'] } },
        {
          condition: "labelPosition === 'left'",
          attributes: { class: ['mk-switch--label-left'] },
        },
        {
          condition: 'onLabel || offLabel',
          attributes: { class: ['mk-switch--with-track-labels'] },
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
              '.mk-switch--label-left &': {
                flexDirection: 'row-reverse',
                justifyContent: 'flex-end',
              },
            }),
          },
          children: [
            {
              type: 'element',
              tag: 'div',
              extensions: { bem: { element: 'track-wrapper' } },
              attributes: {
                style: {
                  position: 'relative',
                  width: 'var(--switch-width)',
                  height: 'var(--switch-height)',
                  flexShrink: 0,
                },
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
                    role: 'switch',
                    id: { $expression: 'inputId' },
                    checked: { $expression: 'isChecked' },
                    disabled: { $expression: 'disabled' },
                    'aria-invalid': { $expression: 'error ? true : undefined' },
                    'aria-describedby': {
                      $expression:
                        "[description ? `${inputId}-description` : '', error ? `${inputId}-error` : ''].filter(Boolean).join(' ') || undefined",
                    },
                    ...part('input', {
                      position: 'absolute',
                      inset: 0,
                      margin: 0,
                      opacity: 0,
                      zIndex: 1,
                      cursor: 'pointer',
                      ':disabled': { cursor: 'not-allowed' },
                    }),
                  },
                  events: [{ name: 'change', handler: 'handleChange' }],
                },
                {
                  type: 'element',
                  tag: 'span',
                  extensions: { bem: { element: 'track' } },
                  attributes: {
                    'aria-hidden': 'true',
                    ...part('track', {
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: 'var(--switch-radius)',
                      border: '1px solid var(--mk-color-default-border)',
                      background: 'var(--mk-color-default-border)',
                      color: 'var(--mk-color-text)',
                      fontSize: 'calc(var(--switch-height) * 0.45)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      transition: 'background 150ms ease',
                      ':checked + &': {
                        background: 'var(--switch-color)',
                        borderColor: 'var(--switch-color)',
                        color: 'var(--mk-color-white)',
                      },
                      ':focus-visible + &': {
                        outline: '2px solid var(--switch-color)',
                        outlineOffset: '2px',
                      },
                      ':disabled + &': { opacity: 0.6 },
                      '.mk-switch--error &': {
                        borderColor: 'var(--mk-color-error)',
                      },
                    }),
                  },
                  children: [
                    {
                      type: 'element',
                      tag: 'span',
                      extensions: { bem: { element: 'thumb' } },
                      attributes: {
                        ...part('thumb', {
                          position: 'absolute',
                          insetBlockStart: '1px',
                          insetInlineStart: '1px',
                          width: 'var(--switch-thumb-size)',
                          height: 'var(--switch-thumb-size)',
                          borderRadius: 'var(--switch-radius)',
                          background: 'var(--mk-color-white)',
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
                          transition: 'inset-inline-start 150ms ease',
                          ':checked + .mk-switch__track &': {
                            insetInlineStart:
                              'calc(100% - var(--switch-thumb-size) - 1px)',
                          },
                        }),
                      },
                    },
                    when('onLabel', {
                      type: 'element',
                      tag: 'span',
                      extensions: {
                        bem: { element: 'track-label', modifiers: ['on'] },
                      },
                      attributes: {
                        ...part('trackLabel', TRACK_LABEL_ON_STYLE),
                      },
                      children: [{ type: 'text', expression: 'onLabel' }],
                    }),
                    when('offLabel', {
                      type: 'element',
                      tag: 'span',
                      extensions: {
                        bem: { element: 'track-label', modifiers: ['off'] },
                      },
                      attributes: {
                        ...part('trackLabel', TRACK_LABEL_OFF_STYLE),
                      },
                      children: [{ type: 'text', expression: 'offLabel' }],
                    }),
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
                    ...part('label', {
                      cursor: 'pointer',
                      lineHeight: 'var(--switch-height)',
                    }),
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
