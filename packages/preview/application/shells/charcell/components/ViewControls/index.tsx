// The end of a view's heading row: the options placed in the view's region,
// with the view's own options after them (the output's width), the kit's
// slot for the view (`<view>-end`), and the view's own control (the wrap
// toggle, the events' clear). A view the shell's `popovers` names, the
// output by default, holds its options in a charcell Popover; any other lays
// them in the row. No options, no popover. Styled in its index.css.
import { Button, Popover } from 'charcell/react/unlinked';
import { Hint } from '../Hint';
import type { ReactNode } from 'react';
import type { CharcellView } from '../../configuration';
import { useShellConfiguration } from '../../controller-context';
import { OptionControls, useHasOptionControls } from '../OptionControls';
import { SlotOutlet } from '../SlotOutlet';
import './index.css';

/** The views whose options sit in a popover unless the kit says otherwise. */
const POPOVER_VIEWS: CharcellView[] = ['output'];

export function ViewControls({
  view,
  options: ownOptions,
  children,
}: {
  view: CharcellView;
  /** The view's own options, shown after the kit's; omit when it has none. */
  options?: ReactNode;
  children?: ReactNode;
}) {
  const popover = useShellConfiguration().popovers?.[view] ?? POPOVER_VIEWS.includes(view);
  const hasOptions = useHasOptionControls(view) || ownOptions !== undefined;
  const options = !hasOptions ? null : popover ? (
    <Popover
      label={`${view} options`}
      trigger={({ triggerProps }) => (
        <Hint text={`the ${view}'s options`} triggerProps={triggerProps}>
          {(props) => <Button variant="dense" label="options…" {...props} />}
        </Hint>
      )}
    >
      <div className="ViewControls__options">
        <OptionControls placement={view} />
        {ownOptions}
      </div>
    </Popover>
  ) : (
    <>
      <OptionControls placement={view} />
      {ownOptions}
    </>
  );
  return (
    <span className="ViewControls">
      {options}
      <SlotOutlet name={`${view}-end`} />
      {children}
    </span>
  );
}
