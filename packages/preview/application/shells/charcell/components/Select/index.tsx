// The preview's labeled dropdown - charcell's Select (its own monochrome
// listbox; a native <select>'s popup is the operating system's own popup).
// This wrapper keeps the preview-wide call-site API (string value in/out,
// `label`, `testId`). charcell's Select is bare, so a label puts a charcell
// Field around it, pointed at the trigger by id; the test id is stamped on
// the trigger. charcell's layer tokens stack the listbox above a popover panel,
// so a select opened inside the add-content dialog needs no variant of its own.
import { useId } from 'react';
import { Field, Select as CharcellSelect } from 'charcell/react/unlinked';

export interface SelectOption {
  label: string;
  value: string;
}

export function Select(props: {
  /** Omit for a bare trigger (no inline label), e.g. the editor's node pickers. */
  label?: string;
  /** A bare trigger's id, for a label of the caller's own to point at. */
  id?: string;
  value: string;
  options: SelectOption[];
  /** Omit for a display-only select. */
  onChange?: (value: string) => void;
  /** Stamped on the trigger for tests to open the widget. */
  testId?: string;
}) {
  const { label, value, options, onChange, testId } = props;
  const ownId = useId();
  const id = label === undefined ? props.id : ownId;
  const select = (
    <CharcellSelect
      variant="dense"
      id={id}
      items={options.map((option) => ({ value: option.value, label: option.label }))}
      value={value}
      onValueChange={onChange === undefined ? undefined : (next) => onChange(String(next))}
      triggerProps={testId === undefined ? undefined : { 'data-testid': testId }}
    />
  );
  return label === undefined ? (
    select
  ) : (
    <Field label={label} htmlFor={id}>
      {select}
    </Field>
  );
}
