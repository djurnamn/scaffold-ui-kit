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

/** Modeled on Mantine's Radio, as a part of RadioGroup: reads the group's value, name and setter from its context. */
export default defineTemplate({
  type: 'component',
  name: 'Radio',
  description:
    "One option of a `RadioGroup`. Checked when the group's value equals `value`; choosing it sets the group's value. Put it inside a `RadioGroup`. `aria-*`, event handlers, `required`, `form`, `autofocus` and `tabindex` land on the `<input>`; `class`, `style` and `data-*` on the `<label>`.",
  props: {
    value: {
      type: 'string',
      required: true,
      description: 'The value the group takes when this radio is chosen.',
    },
    label: { type: 'string' },
    disabled: { type: 'boolean', default: false },
    size: { type: SIZE_TYPE, default: 'sm' },
    color: { type: COLOR_TYPE, default: 'blue' },
    ...stylesApiProps(['root', 'radio', 'label']),
  },
  extensions: {
    react: {
      imports: [
        "import { useContext } from 'react';",
        "import { RadioGroupContext } from './RadioGroup';",
      ],
      script:
        'const group = useContext(RadioGroupContext);\nconst isChecked = group.selected === value;\nconst choose = () => group.select(value);',
    },
    vue: {
      imports: [
        "import { computed, inject } from 'vue';",
        "import { radioGroupKey } from './RadioGroup.vue';",
      ],
      script:
        'const group = inject(radioGroupKey)!;\nconst isChecked = computed(() => group.selected.value === value);\nconst choose = () => group.select(value);',
    },
    svelte: {
      imports: [
        "import { getContext } from 'svelte';",
        "import type { Readable } from 'svelte/store';",
        "import { radioGroupKey } from './RadioGroup.svelte';",
      ],
      script:
        'const group = getContext<{ selected: Readable<string>; select: (value: string) => void; readonly name: string }>(radioGroupKey);\nconst selected = group.selected;\nconst isChecked = $derived($selected === value);\nconst choose = () => group.select(value);',
    },
  },
  children: [
    {
      type: 'element',
      tag: 'label',
      passthrough: true,
      extensions: { bem: { block: 'mk-radio' } },
      attributes: {
        ...part('root', {
          '--radio-size': {
            $expression:
              "({ xs: '1rem', sm: '1.25rem', md: '1.5rem', lg: '1.875rem', xl: '2.25rem' })[size]",
          },
          '--radio-color': { $expression: '`var(--mk-color-${color}-filled)`' },
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.75rem',
          cursor: 'pointer',
          fontSize: 'var(--mk-font-size-sm)',
          '&.mk-radio--disabled': { cursor: 'not-allowed', opacity: 0.6 },
        }),
      },
      conditionalAttributes: [
        ...modifiersFor('mk-radio', 'size', SIZES),
        {
          condition: 'disabled',
          attributes: { class: ['mk-radio--disabled'] },
        },
      ],
      children: [
        {
          type: 'element',
          tag: 'input',
          // The label root keeps class/style/data-* and the DOM handle; a11y, handlers and form attributes reach the input.
          passthrough: {
            attributes: [
              'aria-*',
              'on*',
              'required',
              'form',
              'autofocus',
              'tabindex',
            ],
            handle: 'routed',
          },
          extensions: { bem: { element: 'radio' } },
          attributes: {
            type: 'radio',
            name: { $expression: 'group.name' },
            value: { $expression: 'value' },
            checked: { $expression: 'isChecked' },
            disabled: { $expression: 'disabled' },
            ...part('radio', {
              appearance: 'none',
              margin: 0,
              flexShrink: 0,
              width: 'var(--radio-size)',
              height: 'var(--radio-size)',
              borderRadius: '50%',
              border: '1px solid var(--mk-color-default-border)',
              background: 'var(--mk-color-body)',
              cursor: 'inherit',
              transition: 'border-width 120ms ease',
              ':checked': {
                borderColor: 'var(--radio-color)',
                borderWidth: 'calc(var(--radio-size) * 0.3)',
              },
              ':focus-visible': {
                outline: '2px solid var(--radio-color)',
                outlineOffset: '2px',
              },
              '.mk-radio-group--error &': {
                borderColor: 'var(--mk-color-error)',
              },
            }),
          },
          events: [{ name: 'change', handler: 'choose' }],
        },
        when('label', {
          type: 'element',
          tag: 'span',
          extensions: { bem: { element: 'label' } },
          attributes: { ...part('label', {}) },
          children: [{ type: 'text', expression: 'label' }],
        }),
      ],
    },
  ],
});
