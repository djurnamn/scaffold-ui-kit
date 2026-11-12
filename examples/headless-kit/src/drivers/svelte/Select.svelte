<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import * as select from '@zag-js/select';
  import { normalizeProps, useMachine } from '@zag-js/svelte';
  import {
    labelListbox,
    mergeTriggerProps,
    selectLabelId,
    selectValueId,
  } from '@scaffold-ui-kit/helpers/zag';
  import { machineApi } from '@scaffold-ui-kit/helpers/zag/svelte';
  import SelectVisual, { type SelectVisualOption } from './SelectVisual.svelte';

  export type SelectOption = SelectVisualOption;

  interface Props extends Omit<HTMLButtonAttributes, 'value'> {
    options: SelectOption[];
    value?: string;
    defaultValue?: string;
    defaultOpen?: boolean;
    onValueChange?: (value: string) => void;
    label?: string;
    placeholder?: string;
    name?: string;
    disabled?: boolean;
  }

  let {
    options,
    value = $bindable(),
    defaultValue,
    defaultOpen,
    onValueChange,
    label,
    placeholder = 'Select...',
    name,
    disabled,
    ...rest
  }: Props = $props();

  const id = $props.id();
  const collection = $derived(
    select.collection({
      items: options,
      itemToValue: (o) => o.value,
      itemToString: (o) => o.label,
      isItemDisabled: (o) => !!o.disabled,
    })
  );
  const api = machineApi(
    () =>
      useMachine(select.machine, () => ({
        id,
        collection,
        value: value === undefined ? undefined : [value],
        defaultValue: defaultValue === undefined ? undefined : [defaultValue],
        name,
        disabled,
        defaultOpen,
        onValueChange: (details: select.ValueChangeDetails) => {
          value = details.value[0] ?? '';
          onValueChange?.(details.value[0] ?? '');
        },
      })),
    (service) => select.connect(service, normalizeProps)
  );

  const baseTrigger = $derived($api.getTriggerProps());
  const labelId = $derived(label ? selectLabelId(baseTrigger.id!) : undefined);
  const valueId = $derived(selectValueId(baseTrigger.id!));
  const triggerProps = $derived(
    mergeTriggerProps(baseTrigger, rest, { labelId, valueId })
  );
  const contentProps = $derived(
    labelListbox($api.getContentProps(), triggerProps, labelId)
  );
</script>

<SelectVisual
  {options}
  {label}
  {placeholder}
  valueText={$api.valueAsString || undefined}
  labelProps={{ ...$api.getLabelProps(), id: labelId }}
  {triggerProps}
  valueProps={{ id: valueId }}
  positionerProps={$api.getPositionerProps()}
  {contentProps}
  hiddenSelectProps={$api.getHiddenSelectProps()}
  itemProps={(item) => $api.getItemProps({ item })}
  itemState={(item) => $api.getItemState({ item }).selected}
/>
