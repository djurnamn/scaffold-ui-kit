import { useId, useMemo, type ComponentProps } from 'react';
import * as select from '@zag-js/select';
import { normalizeProps, useMachine } from '@zag-js/react';
import {
  labelListbox,
  mergeTriggerProps,
  selectLabelId,
  selectValueId,
} from '@scaffold-ui-kit/helpers/zag';
import { SelectVisual, type SelectVisualOption } from './SelectVisual';

export type SelectOption = SelectVisualOption;

export interface SelectProps extends Omit<
  ComponentProps<'button'>,
  'value' | 'defaultValue'
> {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  /** Open the list on first render. */
  defaultOpen?: boolean;
  onValueChange?: (value: string) => void;
  label?: string;
  placeholder?: string;
  name?: string;
  disabled?: boolean;
}

/** A single select driven by a Zag machine, with typeahead and a hidden native select for forms. */
export function Select({
  options,
  value,
  defaultValue,
  defaultOpen,
  onValueChange,
  label,
  placeholder = 'Select...',
  name,
  disabled,
  ...rest
}: SelectProps) {
  const id = useId();
  const collection = useMemo(
    () =>
      select.collection({
        items: options,
        itemToValue: (o) => o.value,
        itemToString: (o) => o.label,
        isItemDisabled: (o) => !!o.disabled,
      }),
    [options]
  );
  const service = useMachine(select.machine, {
    id,
    collection,
    value: value === undefined ? undefined : [value],
    defaultValue: defaultValue === undefined ? undefined : [defaultValue],
    name,
    disabled,
    defaultOpen,
    onValueChange: (details) => onValueChange?.(details.value[0] ?? ''),
  });
  const api = select.connect(service, normalizeProps);

  const baseTrigger = api.getTriggerProps();
  const labelId = label ? selectLabelId(baseTrigger.id!) : undefined;
  const valueId = selectValueId(baseTrigger.id!);
  const triggerProps = mergeTriggerProps(baseTrigger, rest, {
    labelId,
    valueId,
  });

  return (
    <SelectVisual
      options={options}
      label={label}
      placeholder={placeholder}
      valueText={api.valueAsString || undefined}
      labelProps={{ ...api.getLabelProps(), id: labelId }}
      triggerProps={triggerProps}
      valueProps={{ id: valueId }}
      positionerProps={api.getPositionerProps()}
      contentProps={labelListbox(api.getContentProps(), triggerProps, labelId)}
      hiddenSelectProps={api.getHiddenSelectProps()}
      itemProps={(item) => api.getItemProps({ item })}
      itemState={(item) => api.getItemState({ item }).selected}
    />
  );
}
