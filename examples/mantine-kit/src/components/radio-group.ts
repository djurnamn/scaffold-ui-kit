import { defineTemplate } from '@js-template-engine/types';
import {
  SIZE_TYPE,
  part,
  restOverrides,
  stylesApiProps,
  when,
} from '../template-helpers/kit';

const ROOT_STYLE = {
  '--input-font-size': { $expression: '`var(--mk-font-size-${size})`' },
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  fontSize: 'var(--input-font-size)',
};

/**
 * Modeled on Mantine's Radio.Group: a compound root. It owns the two-way `value` and hands the current value,
 * the setter and the shared input `name` to every `Radio` inside through a context, the pattern the
 * js-template-engine getting-started guide describes under "A value that changes".
 */
export default defineTemplate({
  type: 'component',
  name: 'RadioGroup',
  parts: ['Radio'],
  description:
    'A group of `Radio` parts with label, description and error. Controlled with `value` + `onChange` (`v-model`, `bind:value`), or uncontrolled with `defaultValue`. Every radio inside shares one `name`, so arrow keys move between them.',
  rest: { tag: 'div' },
  props: {
    value: {
      type: 'string',
      description:
        'The selected radio value (controlled). Leave it out to let the group keep its own.',
      bindable: {
        current: 'selected',
        setter: 'select',
        defaultProp: 'defaultValue',
        changeProp: 'onChange',
      },
    },
    defaultValue: {
      type: 'string',
      default: '',
      description: 'The initially selected value (uncontrolled).',
    },
    name: {
      type: 'string',
      description:
        'The `name` every radio input shares; generated when absent.',
    },
    label: { type: 'string' },
    description: { type: 'string' },
    error: { type: 'string' },
    withAsterisk: { type: 'boolean', default: false },
    size: { type: SIZE_TYPE, default: 'sm' },
    ...stylesApiProps([
      'root',
      'label',
      'required',
      'description',
      'options',
      'error',
    ]),
    onChange: {
      type: '(value: string) => void',
      description: 'Called with the newly selected value.',
    },
  },
  ids: {
    groupName: { prefix: 'mk-radio-group', prop: 'name' },
    labelId: 'mk-radio-group-label',
    descriptionId: 'mk-radio-group-description',
    errorId: 'mk-radio-group-error',
  },
  extensions: {
    react: {
      imports: [
        "import { createContext } from 'react';",
        'export const RadioGroupContext = createContext<{ selected: string | undefined; select: (value: string) => void; name: string | undefined }>({ selected: undefined, select: () => {}, name: undefined });',
      ],
    },
    vue: {
      model: 'value',
      imports: [
        "import { provide, type InjectionKey, type Ref } from 'vue';",
        "export const radioGroupKey: InjectionKey<{ selected: Readonly<Ref<string>>; select: (value: string) => void; readonly name: string }> = Symbol('radio-group');",
      ],
      script:
        'provide(radioGroupKey, { selected, select, get name() { return groupName.value; } });',
    },
    svelte: {
      imports: [
        "import { setContext } from 'svelte';",
        "import { toStore } from 'svelte/store';",
        "export const radioGroupKey = Symbol('radio-group');",
      ],
      script:
        'setContext(radioGroupKey, { selected: toStore(() => selected), select, get name() { return groupName; } });',
    },
  },
  children: [
    {
      type: 'fragment',
      extensions: {
        react: {
          tag: 'RadioGroupContext',
          attributes: {
            value: { $expression: '{ selected, select, name: groupName }' },
          },
        },
      },
      children: [
        {
          type: 'element',
          tag: 'div',
          extensions: {
            bem: { block: 'mk-radio-group' },
            ...restOverrides('mk-radio-group', 'root', ROOT_STYLE),
          },
          attributes: {
            $spread: { $expression: 'rest' },
            role: 'radiogroup',
            'aria-labelledby': { $expression: 'label ? labelId : undefined' },
            'aria-describedby': {
              $expression:
                "[description ? descriptionId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined",
            },
            'aria-invalid': { $expression: 'error ? true : undefined' },
            ...part('root', ROOT_STYLE),
          },
          conditionalAttributes: [
            {
              condition: 'error',
              attributes: { class: ['mk-radio-group--error'] },
            },
          ],
          children: [
            when('label', {
              type: 'element',
              tag: 'div',
              extensions: { bem: { element: 'label' } },
              attributes: {
                id: { $expression: 'labelId' },
                ...part('label', { fontWeight: 500 }),
              },
              children: [
                { type: 'text', expression: 'label' },
                when('withAsterisk', {
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
                id: { $expression: 'descriptionId' },
                ...part('description', {
                  margin: 0,
                  color: 'var(--mk-color-dimmed)',
                  fontSize: '0.875em',
                }),
              },
              children: [{ type: 'text', expression: 'description' }],
            }),
            {
              type: 'element',
              tag: 'div',
              extensions: { bem: { element: 'options' } },
              attributes: {
                ...part('options', {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  paddingBlock: '0.25rem',
                }),
              },
              children: [{ type: 'slot' }],
            },
            when('error', {
              type: 'element',
              tag: 'p',
              extensions: { bem: { element: 'error' } },
              attributes: {
                id: { $expression: 'errorId' },
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
});
