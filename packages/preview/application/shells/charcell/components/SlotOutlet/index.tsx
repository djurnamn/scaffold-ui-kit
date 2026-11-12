// A named slot of the shell: where the kit's fill for it mounts. The outlet
// renders one element and hands it to the fill with the controller; the fill
// renders whatever it likes inside, in its own framework, and is unmounted
// with the outlet. A slot with no fill renders nothing.
import { useEffect, useRef } from 'react';
import type { CharcellSlotName } from '../../configuration';
import { usePreviewController, useShellConfiguration } from '../../controller-context';
import './index.css';

export function SlotOutlet({ name }: { name: CharcellSlotName }) {
  const controller = usePreviewController();
  const fill = useShellConfiguration().slots?.[name];
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fill || !element.current) return;
    const unmount = fill(element.current, controller);
    return () => {
      unmount?.();
    };
  }, [fill, controller]);
  if (!fill) return null;
  // `display: contents` (index.css): the fill's children sit in the
  // bar's zone as the option controls do, with no box of the outlet's own.
  return <div ref={element} className="SlotOutlet" data-preview-slot={name} />;
}
