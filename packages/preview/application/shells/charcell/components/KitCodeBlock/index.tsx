// The kit's own code block (`catalog.codeBlock`) in a code pane: the element
// the controller mounts the block's iframe in, filling the pane's place for
// the source. The block shows the target's source, follows it, and wraps
// its long lines as the shell's `wrap` option says. Styled in its index.css.
import { useEffect, useRef } from 'react';
import type { PreviewTarget } from '../../../../../src/shell';
import { usePreviewController, usePreviewState } from '../../controller-context';
import { WRAP_OPTION } from '../../shell-options';
import './index.css';

export function KitCodeBlock({ target }: { target: PreviewTarget }) {
  const controller = usePreviewController();
  const element = useRef<HTMLDivElement>(null);
  const wrapped = usePreviewState((state) => state.options[WRAP_OPTION] !== false);
  useEffect(() => controller.frames.mountCode(element.current!, target), [controller, target]);
  useEffect(() => controller.frames.wrapCode(wrapped), [controller, wrapped]);
  return <div ref={element} className="KitCodeBlock" data-preview-kit-code={target} />;
}
