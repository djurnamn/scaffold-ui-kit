import { defineTemplate } from '@js-template-engine/types';
import { SIZE_TYPE, part, stylesApiProps } from '../template-helpers/kit';

/** TextInput = InputWrapper (label / description / error) around an <input>; leftover attributes land on the input, as in Mantine. */
export default defineTemplate({
  type: 'component',
  name: 'TextInput',
  description:
    'A text input with label, description and error (via `InputWrapper`); ids are wired for accessibility. Controlled with `value` + `onValueChange`, or uncontrolled with `defaultValue`. Attributes you pass that are not props (`name`, `type`, `autoComplete`, `aria-*`, handlers, ...) land on the `<input>`; `class`, `style` and `data-*` on the root, as in Mantine.',
  props: {
    label: { type: 'string' },
    description: { type: 'string' },
    error: { type: 'string' },
    placeholder: { type: 'string' },
    required: { type: 'boolean', default: false },
    withAsterisk: { type: 'boolean' },
    disabled: { type: 'boolean', default: false },
    id: { type: 'string', description: 'The input id; generated when absent.' },
    value: {
      type: 'string',
      description:
        'The value (controlled). Leave it out to let the input keep its own.',
      bindable: {
        current: 'currentValue',
        setter: 'setValue',
        defaultProp: 'defaultValue',
        changeProp: 'onValueChange',
      },
    },
    defaultValue: {
      type: 'string',
      default: '',
      description: 'The initial value (uncontrolled).',
    },
    size: { type: SIZE_TYPE, default: 'sm' },
    radius: { type: SIZE_TYPE, default: 'sm' },
    ...stylesApiProps([
      'root',
      'label',
      'required',
      'description',
      'input',
      'error',
    ]),
    onValueChange: {
      type: '(value: string) => void',
      description: 'Called with the new value on every keystroke.',
    },
  },
  script:
    'function handleInput(event: { currentTarget: EventTarget | null }) {\n  setValue((event.currentTarget as HTMLInputElement).value);\n}',
  ids: { inputId: { prefix: 'mk-text-input', prop: 'id' } },
  extensions: {
    react: { imports: ["import { InputWrapper } from './InputWrapper';"] },
    vue: {
      model: 'value',
      imports: ["import InputWrapper from './InputWrapper.vue';"],
    },
    svelte: { imports: ["import InputWrapper from './InputWrapper.svelte';"] },
  },
  children: [
    {
      type: 'element',
      tag: 'div',
      passthrough: true,
      extensions: { bem: { block: 'mk-text-input' } },
      children: [
        {
          type: 'element',
          tag: 'InputWrapper',
          attributes: {
            inputId: { $expression: 'inputId' },
            label: { $expression: 'label' },
            description: { $expression: 'description' },
            error: { $expression: 'error' },
            required: { $expression: 'required' },
            withAsterisk: { $expression: 'withAsterisk' },
            size: { $expression: 'size' },
            classNames: { $expression: 'classNames' },
            styles: { $expression: 'styles' },
          },
          children: [
            {
              type: 'element',
              tag: 'input',
              extensions: {
                bem: { element: 'input' },
                react: { events: [{ name: 'change', handler: 'handleInput' }] },
              },
              // Mantine: class, style and data-* go to the root; every other consumer attribute to the <input>.
              passthrough: { attributes: ['*'], handle: 'routed' },
              attributes: {
                id: { $expression: 'inputId' },
                value: { $expression: 'currentValue' },
                placeholder: { $expression: 'placeholder' },
                required: { $expression: 'required' },
                disabled: { $expression: 'disabled' },
                'aria-invalid': { $expression: 'error ? true : undefined' },
                'aria-describedby': {
                  $expression:
                    "[description ? `${inputId}-description` : '', error ? `${inputId}-error` : ''].filter(Boolean).join(' ') || undefined",
                },
                ...part('input', {
                  '--input-height': {
                    $expression: '`var(--mk-control-height-${size})`',
                  },
                  '--input-radius': {
                    $expression: '`var(--mk-radius-${radius})`',
                  },
                  height: 'var(--input-height)',
                  paddingInline: '0.75rem',
                  fontSize: 'inherit',
                  fontFamily: 'inherit',
                  color: 'var(--mk-color-text)',
                  background: 'var(--mk-color-body)',
                  border: '1px solid var(--mk-color-default-border)',
                  borderRadius: 'var(--input-radius)',
                  ':focus': {
                    outline: 'none',
                    borderColor: 'var(--mk-color-blue-filled)',
                  },
                  ':disabled': { opacity: 0.6, cursor: 'not-allowed' },
                  '&[aria-invalid="true"]': {
                    borderColor: 'var(--mk-color-error)',
                    color: 'var(--mk-color-error)',
                  },
                }),
              },
              events: [{ name: 'input', handler: 'handleInput' }],
            },
          ],
        },
      ],
    },
  ],
});
