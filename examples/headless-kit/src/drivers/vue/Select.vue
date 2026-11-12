<script setup lang="ts">
import * as select from '@zag-js/select';
import { normalizeProps, useMachine } from '@zag-js/vue';
import { computed, useAttrs, useId } from 'vue';
import {
  labelListbox,
  mergeTriggerProps,
  selectLabelId,
  selectValueId,
} from '@scaffold-ui-kit/helpers/zag';
import SelectVisual, { type SelectVisualOption } from './SelectVisual.vue';

export type SelectOption = SelectVisualOption;

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  defaultOpen?: boolean;
  label?: string;
  placeholder?: string;
  name?: string;
  disabled?: boolean;
}

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<SelectProps>(), {
  placeholder: 'Select...',
  disabled: undefined,
  defaultOpen: undefined,
});
const emit = defineEmits<{
  'update:value': [value: string];
  valueChange: [value: string];
}>();
const attrs = useAttrs();

const id = useId();
const collection = computed(() =>
  select.collection({
    items: props.options,
    itemToValue: (o) => o.value,
    itemToString: (o) => o.label,
    isItemDisabled: (o) => !!o.disabled,
  })
);
const service = useMachine(
  select.machine,
  computed(() => ({
    id,
    collection: collection.value,
    value: props.value === undefined ? undefined : [props.value],
    defaultValue:
      props.defaultValue === undefined ? undefined : [props.defaultValue],
    name: props.name,
    defaultOpen: props.defaultOpen,
    disabled: props.disabled,
    onValueChange: (details: select.ValueChangeDetails) => {
      emit('update:value', details.value[0] ?? '');
      emit('valueChange', details.value[0] ?? '');
    },
  }))
);
const api = computed(() => select.connect(service, normalizeProps));

const parts = computed(() => {
  const baseTrigger = api.value.getTriggerProps();
  const labelId = props.label ? selectLabelId(baseTrigger.id!) : undefined;
  const valueId = selectValueId(baseTrigger.id!);
  const triggerProps = mergeTriggerProps(baseTrigger, attrs, {
    labelId,
    valueId,
  });
  return {
    labelId,
    valueId,
    triggerProps,
    contentProps: labelListbox(
      api.value.getContentProps(),
      triggerProps,
      labelId
    ),
  };
});
</script>

<template>
  <SelectVisual
    :options="options"
    :label="label"
    :placeholder="placeholder"
    :value-text="api.valueAsString || undefined"
    :label-props="{ ...api.getLabelProps(), id: parts.labelId }"
    :trigger-props="parts.triggerProps"
    :value-props="{ id: parts.valueId }"
    :positioner-props="api.getPositionerProps()"
    :content-props="parts.contentProps"
    :hidden-select-props="api.getHiddenSelectProps()"
    :item-props="(item) => api.getItemProps({ item })"
    :item-state="(item) => api.getItemState({ item }).selected"
  />
</template>
