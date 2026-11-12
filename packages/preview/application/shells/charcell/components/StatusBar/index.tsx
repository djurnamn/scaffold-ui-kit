// The shell's bottom status bar: the panes' state (PaneStatus) and a copy of
// the preview's address (CopyLink) at the start; at the end, the options
// placed in the status bar (a global option of a group of the kit's own
// naming, unless the kit places it elsewhere), the kit's `status-bar` slot,
// and a hint of the shell's keys.
import { Bar } from '../Bar';
import { CopyLink } from '../CopyLink';
import { KeyHints } from '../KeyHints';
import { OptionControls } from '../OptionControls';
import { PaneStatus } from '../PaneStatus';
import { SlotOutlet } from '../SlotOutlet';

export function StatusBar() {
  return (
    <Bar
      variant="status"
      joined
      end={
        <>
          <OptionControls placement="status-bar" />
          <SlotOutlet name="status-bar" />
          <KeyHints />
        </>
      }
    >
      <PaneStatus />
      <CopyLink />
    </Bar>
  );
}
