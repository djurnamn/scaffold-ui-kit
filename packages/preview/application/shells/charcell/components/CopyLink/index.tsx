// The status bar's `copy link`: the address of what the preview shows now -
// the story, its scenario and props, the options and the views - which opens
// it as it is. It says `link copied` for a moment after.
import { Button } from 'charcell/react/unlinked';
import { useEffect, useState } from 'react';
import { Hint } from '../Hint';

/** How long the confirmation shows, in milliseconds. */
const COPIED_MILLISECONDS = 1500;

export function CopyLink() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Hint text="copy the address of what the preview shows now">
      {(hint) => (
        <Button
          {...hint}
          variant="dense"
          label={copied ? 'link copied' : 'copy link'}
          onClick={() =>
            navigator.clipboard?.writeText(window.location.href).then(
              () => setCopied(true),
              () => undefined,
            )
          }
        />
      )}
    </Hint>
  );
}
