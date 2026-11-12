<script setup lang="ts">
import * as dialog from '@zag-js/dialog';
import { normalizeProps, useMachine } from '@zag-js/vue';
import { computed, useAttrs, useId } from 'vue';
import { mergeRootProps } from '@scaffold-ui-kit/helpers/runtime';
import {
  resolveOverlayLabeling,
  returningFocus,
  withoutUnrenderedDescription,
} from '@scaffold-ui-kit/helpers/zag';
import ModalVisual from './ModalVisual.vue';

export interface ModalProps {
  open?: boolean;
  defaultOpen?: boolean;
  title?: string | null;
  label?: string;
  description?: string | null;
  finalFocus?: () => HTMLElement | null;
}

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<ModalProps>(), {
  open: undefined,
  defaultOpen: undefined,
});
const emit = defineEmits<{
  'update:open': [open: boolean];
  openChange: [open: boolean];
}>();
const attrs = useAttrs();

const id = useId();
const triggerId = `${id}-trigger`;
const returning = returningFocus();
const service = useMachine(
  dialog.machine,
  computed(() => ({
    id,
    open: props.open,
    defaultOpen: props.defaultOpen,
    onOpenChange: (details: { open: boolean }) => {
      if (details.open) returning.remember();
      emit('update:open', details.open);
      emit('openChange', details.open);
    },
    ids: { trigger: triggerId },
    finalFocusEl: returning.finalFocusEl(() => triggerId, props.finalFocus),
  }))
);
const api = computed(() => dialog.connect(service, normalizeProps));
const contentProps = computed(() => {
  const base = api.value.getContentProps();
  const labeled =
    props.title == null ? resolveOverlayLabeling(base, props.label) : base;
  return props.description == null
    ? withoutUnrenderedDescription(labeled)
    : labeled;
});
</script>

<template>
  <button v-bind="mergeRootProps(api.getTriggerProps(), attrs)">
    <slot name="trigger" />
  </button>
  <Teleport to="body">
    <ModalVisual
      :open="api.open"
      :backdrop-props="api.getBackdropProps()"
      :positioner-props="api.getPositionerProps()"
      :content-props="contentProps"
      :title-props="api.getTitleProps()"
      :description-props="api.getDescriptionProps()"
      :close-props="api.getCloseTriggerProps()"
      :title="title"
      :description="description"
    >
      <slot />
    </ModalVisual>
  </Teleport>
</template>
