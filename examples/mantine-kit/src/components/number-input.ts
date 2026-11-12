import { defineTemplate } from '@js-template-engine/types';
import { SIZE_TYPE, part, stylesApiProps, when } from '../template-helpers/kit';

const controlStyle = {
  flex: '1',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0',
  border: '0',
  background: 'transparent',
  color: 'var(--mk-color-dimmed)',
  cursor: 'pointer',
  fontSize: '0.625rem',
  lineHeight: '1',
  ':hover': {
    background: 'var(--mk-color-blue-light)',
    color: 'var(--mk-color-text)',
  },
  ':disabled': {
    cursor: 'not-allowed',
    opacity: 0.4,
    background: 'transparent',
  },
};

/**
 * Modeled on Mantine's NumberInput: a text input that holds a number, with increment / decrement controls,
 * arrow-key stepping, `min` / `max` / `step`, and clamping on blur. The value is `number | ''`
 * (empty while the field is cleared), two-way as on every other input.
 */
export default defineTemplate({
  type: 'component',
  name: 'NumberInput',
  description:
    "A number field with label, description and error (via `InputWrapper`), increment / decrement controls and arrow-key stepping. `min`, `max` and `step` bound it; a typed value outside them is clamped on blur. Controlled with `value` + `onValueChange` (`v-model`, `bind:value`), or uncontrolled with `defaultValue`; the value is a number, or `''` while the field is empty. Attributes that are not props (`name`, `aria-*`, handlers, `ref`) land on the `<input>`; `class`, `style` and `data-*` on the root.",
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
      type: "number | ''",
      description:
        "The value (controlled): a number, or `''` while the field is empty.",
      bindable: {
        current: 'currentValue',
        setter: 'setValue',
        defaultProp: 'defaultValue',
        changeProp: 'onValueChange',
      },
    },
    defaultValue: {
      type: "number | ''",
      default: '',
      description: 'The initial value (uncontrolled).',
    },
    min: {
      type: 'number',
      description: 'The smallest value the controls and clamping allow.',
    },
    max: {
      type: 'number',
      description: 'The largest value the controls and clamping allow.',
    },
    step: {
      type: 'number',
      default: 1,
      description: 'How far a control click or an arrow key moves the value.',
    },
    hideControls: {
      type: 'boolean',
      default: false,
      description: 'Hides the increment / decrement controls.',
    },
    size: { type: SIZE_TYPE, default: 'sm' },
    radius: { type: SIZE_TYPE, default: 'sm' },
    ...stylesApiProps([
      'root',
      'label',
      'required',
      'description',
      'input',
      'controls',
      'control',
      'error',
    ]),
    onValueChange: {
      type: "(value: number | '') => void",
      description:
        'Called with the new value: on typing, a control click or an arrow key.',
    },
  },
  // Written once; every target keeps these in step with the value and the bounds.
  derived: {
    numericValue: "currentValue === '' ? undefined : currentValue",
    canIncrement:
      '!disabled && (max === undefined || numericValue === undefined || numericValue < max)',
    canDecrement:
      '!disabled && (min === undefined || numericValue === undefined || numericValue > min)',
  },
  script: [
    'function clamp(next: number) {',
    '  const decimals = (String(step).split(".")[1] ?? "").length;',
    '  let rounded = Number(next.toFixed(decimals));',
    '  if (max !== undefined) rounded = Math.min(rounded, max);',
    '  if (min !== undefined) rounded = Math.max(rounded, min);',
    '  return rounded;',
    '}',
    'function stepBy(direction: number) {',
    '  if (disabled) return;',
    '  const base = numericValue ?? (direction > 0 ? (min ?? 0) - step : (max ?? 0) + step);',
    '  setValue(clamp(base + direction * step));',
    '}',
    'function increment() {',
    '  stepBy(1);',
    '}',
    'function decrement() {',
    '  stepBy(-1);',
    '}',
    'function handleInput(event: { currentTarget: EventTarget | null }) {',
    '  const raw = (event.currentTarget as HTMLInputElement).value.trim();',
    '  if (raw === "") setValue("");',
    '  else if (!Number.isNaN(Number(raw))) setValue(Number(raw));',
    '}',
    'function handleKeydown(event: { key: string; preventDefault(): void }) {',
    '  if (event.key === "ArrowUp") {',
    '    event.preventDefault();',
    '    increment();',
    '  } else if (event.key === "ArrowDown") {',
    '    event.preventDefault();',
    '    decrement();',
    '  }',
    '}',
    'function handleBlur() {',
    '  if (numericValue !== undefined && clamp(numericValue) !== numericValue) setValue(clamp(numericValue));',
    '}',
  ].join('\n'),
  ids: { inputId: { prefix: 'mk-number-input', prop: 'id' } },
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
      extensions: { bem: { block: 'mk-number-input' } },
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
              tag: 'div',
              extensions: { bem: { element: 'wrapper' } },
              attributes: {
                style: {
                  '--input-height': {
                    $expression: '`var(--mk-control-height-${size})`',
                  },
                  '--input-radius': {
                    $expression: '`var(--mk-radius-${radius})`',
                  },
                  position: 'relative',
                  display: 'flex',
                },
              },
              children: [
                {
                  type: 'element',
                  tag: 'input',
                  extensions: {
                    bem: { element: 'input' },
                    // The override replaces React's whole event list, so it repeats keydown and blur.
                    react: {
                      events: [
                        { name: 'change', handler: 'handleInput' },
                        { name: 'keydown', handler: 'handleKeydown' },
                        { name: 'blur', handler: 'handleBlur' },
                      ],
                    },
                  },
                  passthrough: { attributes: ['*'], handle: 'routed' },
                  attributes: {
                    id: { $expression: 'inputId' },
                    type: 'text',
                    inputmode: 'decimal',
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
                      flex: '1',
                      minWidth: '0',
                      height: 'var(--input-height)',
                      paddingInline: '0.75rem',
                      fontSize: 'inherit',
                      fontFamily: 'inherit',
                      fontVariantNumeric: 'tabular-nums',
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
                  events: [
                    { name: 'input', handler: 'handleInput' },
                    { name: 'keydown', handler: 'handleKeydown' },
                    { name: 'blur', handler: 'handleBlur' },
                  ],
                },
                when('!hideControls', {
                  type: 'element',
                  tag: 'div',
                  extensions: { bem: { element: 'controls' } },
                  attributes: {
                    ...part('controls', {
                      position: 'absolute',
                      insetBlock: '1px',
                      insetInlineEnd: '1px',
                      width: '1.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      borderInlineStart:
                        '1px solid var(--mk-color-default-border)',
                      borderStartEndRadius: 'var(--input-radius)',
                      borderEndEndRadius: 'var(--input-radius)',
                      overflow: 'hidden',
                    }),
                  },
                  children: [
                    {
                      type: 'element',
                      tag: 'button',
                      extensions: {
                        bem: { element: 'control', modifiers: ['up'] },
                      },
                      attributes: {
                        type: 'button',
                        tabindex: '-1',
                        'aria-label': 'Increment',
                        disabled: { $expression: '!canIncrement' },
                        ...part('control', controlStyle),
                      },
                      events: [{ name: 'click', handler: 'increment' }],
                      children: [{ type: 'text', content: '▲' }],
                    },
                    {
                      type: 'element',
                      tag: 'button',
                      extensions: {
                        bem: { element: 'control', modifiers: ['down'] },
                      },
                      attributes: {
                        type: 'button',
                        tabindex: '-1',
                        'aria-label': 'Decrement',
                        disabled: { $expression: '!canDecrement' },
                        ...part('control', {
                          ...controlStyle,
                          '&.mk-number-input__control--down': {
                            borderBlockStart:
                              '1px solid var(--mk-color-default-border)',
                          },
                        }),
                      },
                      events: [{ name: 'click', handler: 'decrement' }],
                      children: [{ type: 'text', content: '▼' }],
                    },
                  ],
                }),
              ],
            },
          ],
        },
      ],
    },
  ],
});
