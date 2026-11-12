// The code panes' wrap toggle, one for every pane, at the end of the code
// view's heading row: the shell's `wrap` option, so the address keeps it.
// On, a long line wraps at its pane's edge; off, it runs on and the source
// scrolls across. A kit's own code block follows it too, told through the
// controller (KitCodeBlock).
import { Toggle } from 'charcell/react/unlinked';
import { usePreviewController, usePreviewState } from '../../controller-context';
import { WRAP_OPTION } from '../../shell-options';
import { Hint } from '../Hint';

export function WrapToggle() {
  const controller = usePreviewController();
  const wrapped = usePreviewState((state) => state.options[WRAP_OPTION] !== false);
  return (
    <Hint text="wrap long lines in every code pane" around>
      {(hint) => (
        <Toggle
          variant="dense"
          {...hint}
          label="wrap"
          pressed={wrapped}
          onPressedChange={() => controller.actions.setOption(WRAP_OPTION, !wrapped)}
        />
      )}
    </Hint>
  );
}
