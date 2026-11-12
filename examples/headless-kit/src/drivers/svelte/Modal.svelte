<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import * as dialog from '@zag-js/dialog';
  import { normalizeProps, useMachine } from '@zag-js/svelte';
  import { mergeRootProps } from '@scaffold-ui-kit/helpers/runtime';
  import { portal } from '@scaffold-ui-kit/helpers/runtime/svelte';
  import {
    resolveOverlayLabeling,
    returningFocus,
    withoutUnrenderedDescription,
  } from '@scaffold-ui-kit/helpers/zag';
  import { machineApi } from '@scaffold-ui-kit/helpers/zag/svelte';
  import ModalVisual from './ModalVisual.svelte';

  interface Props extends Omit<HTMLButtonAttributes, 'title'> {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    title?: string | null;
    label?: string;
    description?: string | null;
    finalFocus?: () => HTMLElement | null;
    children?: Snippet;
    trigger?: Snippet;
  }

  let {
    open = $bindable(),
    defaultOpen,
    onOpenChange,
    title,
    label,
    description,
    finalFocus,
    children,
    trigger,
    ...rest
  }: Props = $props();

  const id = $props.id();
  const triggerId = `${id}-trigger`;
  const returning = returningFocus();
  const api = machineApi(
    () =>
      useMachine(dialog.machine, () => ({
        id,
        open,
        defaultOpen,
        onOpenChange: (details: { open: boolean }) => {
          if (details.open) returning.remember();
          open = details.open;
          onOpenChange?.(details.open);
        },
        ids: { trigger: triggerId },
        finalFocusEl: returning.finalFocusEl(() => triggerId, finalFocus),
      })),
    (service) => dialog.connect(service, normalizeProps)
  );

  const contentProps = $derived.by(() => {
    const base = $api.getContentProps();
    const labeled = title == null ? resolveOverlayLabeling(base, label) : base;
    return description == null
      ? withoutUnrenderedDescription(labeled)
      : labeled;
  });
</script>

<button {...mergeRootProps($api.getTriggerProps(), rest)}
  >{@render trigger?.()}</button
>
{#if $api.open}
  <div use:portal={'body'}>
    <ModalVisual
      open={$api.open}
      backdropProps={$api.getBackdropProps()}
      positionerProps={$api.getPositionerProps()}
      {contentProps}
      titleProps={$api.getTitleProps()}
      descriptionProps={$api.getDescriptionProps()}
      closeProps={$api.getCloseTriggerProps()}
      {title}
      {description}
      {children}
    />
  </div>
{/if}
