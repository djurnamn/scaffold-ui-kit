// One prop control (text / boolean / number / select / color-select) in the
// scenario editor's props window: the prop's name and its control, laid as two
// cells of the window's grid, so every name lines up in one column and every
// control in the next. A prop left unset shows the default the component
// declares or documents: in a select's unset option (`(unset: solid)`), as a
// field's placeholder, and as a boolean's state. Composed from charcell's
// TextInput and Toggle and the preview's Select. Styled in its index.css.
import { useId } from 'react';
import { TextInput, Toggle } from 'charcell/react/unlinked';
import type { PreviewPropType } from '../../../../../src/shell';
import { usePreviewController } from '../../controller-context';
import { Select } from '../Select';
import { Hint } from '../Hint';
import './index.css';

type Json = unknown;

/** The default a prop takes while unset, as the reader reads it: the
 *  component's declared default, or else the one it documents, its quotes
 *  dropped. */
function defaultOf(propType: PreviewPropType): string | undefined {
  if (propType.declaredDefault !== undefined && propType.declaredDefault !== null)
    return typeof propType.declaredDefault === 'string'
      ? propType.declaredDefault
      : JSON.stringify(propType.declaredDefault);
  return propType.documentedDefault?.replace(/^(['"`])(.*)\1$/, '$2');
}

export function Control(props: { propType: PreviewPropType; value: Json; onChange: (nextValue: Json) => void }) {
  const { propType, value, onChange } = props;
  const controller = usePreviewController();
  const id = useId();
  const fallback = defaultOf(propType);
  let control: React.ReactNode;
  let labeled = true;
  if (propType.control === 'boolean') {
    // Unset, a boolean shows the state its default gives it.
    const on = value === undefined ? fallback === 'true' : Boolean(value);
    // The toggle's text is its state; the prop's name names it.
    labeled = false;
    control = (
      <Toggle variant="dense" aria-labelledby={`${id}-label`} label={on ? 'on' : 'off'} pressed={on} onPressedChange={() => onChange(!on)} />
    );
  } else if (propType.control === 'number') {
    const numberRange = propType.number ?? {};
    control = (
      <TextInput
        id={id}
        variant="dense"
        type="number"
        min={numberRange.min}
        max={numberRange.max}
        step={numberRange.step}
        placeholder={fallback}
        value={value === undefined ? '' : String(value)}
        onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
      />
    );
  } else if (propType.control === 'select' || propType.control === 'color-select') {
    // A select's values are strings or booleans (`boolean | 'indeterminate'`
    // offers true, false and 'indeterminate'), each written as its text and
    // read back as the value it stands for.
    const raw: (string | boolean | null | undefined)[] =
      propType.control === 'color-select' ? controller.catalog.colorTokens : propType.options ?? [];
    const unset = fallback === undefined ? '(unset)' : `(unset: ${fallback})`;
    control = (
      <Select
        id={id}
        value={value === undefined ? '' : String(value)}
        onChange={(selected) =>
          onChange(
            selected === ''
              ? undefined
              : raw.find((option) => option !== null && option !== undefined && String(option) === selected) ?? selected
          )
        }
        options={raw.map((option) => ({
          value: option === null || option === undefined ? '' : String(option),
          label: option === null || option === undefined ? unset : String(option),
        }))}
      />
    );
  } else {
    control = (
      <TextInput
        id={id}
        variant="dense"
        type="text"
        placeholder={fallback}
        value={value === undefined ? '' : String(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    // The description is a hint over the name: the row itself has no box
    // to hover.
    <div className="Control">
      {/* `<id>-label`, as charcell's Field gives a label: a select and a
          boolean's toggle name themselves from it. The hint takes it as its
          trigger's id, so it opens beside the name. */}
      <Hint text={propType.description} markdown triggerProps={{ id: `${id}-label` }}>
        {(hint) =>
          labeled ? (
            <label {...hint} className="Control__label" htmlFor={id}>
              {propType.name}
            </label>
          ) : (
            <span {...hint} className="Control__label">
              {propType.name}
            </span>
          )
        }
      </Hint>
      <span className="Control__value">{control}</span>
    </div>
  );
}
