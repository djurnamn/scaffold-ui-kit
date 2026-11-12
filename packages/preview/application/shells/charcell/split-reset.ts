// The reset gesture on the stage grid's handles (PreviewGrid): a double-click
// on a handle, or Enter while it holds the focus, puts the split it moves
// back at its even distribution. The handle's own handlers, charcell's
// dragging and stepping, run first and keep working as they do.

/** The key that resets a focused handle. */
export const RESET_KEY = 'Enter';

/** A handle's props, as the grid hands them, with their event handlers. */
type HandleProps = Record<string, unknown>;

/** The handlers the reset gesture composes with a handle's own. */
export interface ResetHandlers {
  onDoubleClick: (event: { button?: number }) => void;
  onKeyDown: (event: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => void;
}

/** Calls the handler `props` holds under `name`, if it holds one. */
function callOwn(props: HandleProps, name: string, event: unknown): void {
  const own = props[name];
  if (typeof own === 'function') own(event);
}

/**
 * A handle's props with the reset gesture added: `reset` runs on a
 * double-click on the handle, and on Enter while it holds the focus, after
 * the handle's own `onDoubleClick` and `onKeyDown`.
 *
 * @param props - The handle's props, as the grid hands them.
 * @param reset - Puts the handle's split back at its even distribution.
 * @returns The props, their double-click and key handlers composed with the reset.
 * @example
 * <SplitGridHandle {...withResetGesture(grid.columnHandleProps(0), () => grid.columnsApi.resetSizes())} />
 */
export function withResetGesture<Props extends HandleProps>(props: Props, reset: () => void): Props & ResetHandlers {
  return {
    ...props,
    onDoubleClick: (event) => {
      callOwn(props, 'onDoubleClick', event);
      if ((event.button ?? 0) === 0) reset();
    },
    onKeyDown: (event) => {
      callOwn(props, 'onKeyDown', event);
      if (event.key === RESET_KEY && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) reset();
    },
  };
}
