// The status bar's word on the selection's panes: `regeneration failed` while
// the scenario editor's last regeneration failed, `regenerating` while one
// runs, `render error` with the targets whose story threw, `loading` while a
// pane loads, and `ready` once every pane shows its story. The messages behind
// a failure open as a hint over it (Hint), from the pointer or the keyboard.
// Styled in its index.css.
import { usePreviewState } from '../../controller-context';
import { Hint } from '../Hint';
import './index.css';

export function PaneStatus() {
  const regeneration = usePreviewState((state) => state.regeneration);
  const frames = usePreviewState((state) => state.frames);
  const errors = usePreviewState((state) => state.frameErrors);
  const failing = Object.entries(errors).filter((entry): entry is [string, string] => entry[1] !== undefined);
  const loading = Object.values(frames).includes('loading');
  const [word, detail, failed] =
    regeneration.status === 'error'
      ? ['regeneration failed', regeneration.message, true]
      : regeneration.status === 'pending'
        ? ['regenerating…', undefined, false]
        : failing.length > 0
          ? [
              `render error · ${failing.map(([target]) => target).join(', ')}`,
              failing.map(([target, message]) => `${target}: ${message}`).join('\n'),
              true,
            ]
          : loading
            ? ['loading…', undefined, false]
            : ['ready', undefined, false];
  return (
    <Hint text={detail}>
      {(hint) => (
        // With messages behind it, the word takes focus, so the keyboard
        // opens them as the pointer does.
        <span
          {...hint}
          className={`PaneStatus${failed ? ' PaneStatus--failed' : ''}`}
          role="status"
          tabIndex={detail ? 0 : undefined}
        >
          {word}
        </span>
      )}
    </Hint>
  );
}
