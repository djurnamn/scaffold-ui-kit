import {
  useId,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import * as dialog from '@zag-js/dialog';
import { normalizeProps, useMachine } from '@zag-js/react';
import { mergeRootProps } from '@scaffold-ui-kit/helpers/runtime';
import {
  resolveOverlayLabeling,
  returningFocus,
  withoutUnrenderedDescription,
} from '@scaffold-ui-kit/helpers/zag';
import { ModalVisual } from './ModalVisual';

export interface ModalProps extends Omit<ComponentProps<'button'>, 'title'> {
  /** The open state. Leave it out to let the modal keep its own. */
  open?: boolean;
  /** The initial open state when uncontrolled. */
  defaultOpen?: boolean;
  /** Called with the next open state. */
  onOpenChange?: (open: boolean) => void;
  /** The visible title. Without one, pass `label`. */
  title?: string | null;
  /** The accessible name when there is no visible title. */
  label?: string;
  /** The visible description. */
  description?: string | null;
  /** The element to focus when neither the trigger nor the previously focused element is on the page. */
  finalFocus?: () => HTMLElement | null;
  /** The modal's content. */
  children?: ReactNode;
  /** The trigger's content. */
  trigger?: ReactNode;
}

const subscribeToNothing = () => () => {};

/** A modal dialog driven by a Zag machine: focus trapped, background inert, Escape and an outside press close it. */
export function Modal({
  open,
  defaultOpen,
  onOpenChange,
  title,
  label,
  description,
  finalFocus,
  children,
  trigger,
  ...rest
}: ModalProps) {
  const id = useId();
  // False on the server and while hydrating, so the two agree; a portal needs a document.
  const canPortal = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
  const triggerId = `${id}-trigger`;
  const returning = useRef(returningFocus()).current;
  const service = useMachine(dialog.machine, {
    id,
    open,
    defaultOpen,
    onOpenChange: (details) => {
      if (details.open) returning.remember();
      onOpenChange?.(details.open);
    },
    ids: { trigger: triggerId },
    finalFocusEl: returning.finalFocusEl(() => triggerId, finalFocus),
  });
  const api = dialog.connect(service, normalizeProps);

  const baseContent = api.getContentProps();
  let contentProps =
    title == null ? resolveOverlayLabeling(baseContent, label) : baseContent;
  if (description == null)
    contentProps = withoutUnrenderedDescription(contentProps);

  const panel = (
    <ModalVisual
      open={api.open}
      backdropProps={api.getBackdropProps()}
      positionerProps={api.getPositionerProps()}
      contentProps={contentProps}
      titleProps={api.getTitleProps()}
      descriptionProps={api.getDescriptionProps()}
      closeProps={api.getCloseTriggerProps()}
      title={title}
      description={description}
    >
      {children}
    </ModalVisual>
  );

  return (
    <>
      <button {...mergeRootProps(api.getTriggerProps(), rest)}>
        {trigger}
      </button>
      {canPortal && createPortal(panel, document.body)}
    </>
  );
}
