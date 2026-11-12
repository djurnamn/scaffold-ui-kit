// One code pane, under a target's preview pane in the stage's grid
// (PreviewGrid): the story's source as a consumer writes it for that
// target, in a quiet charcell Frame titled with the target. A row says what
// the pane holds, with a copy button at its end, over the source in a
// charcell CodeBlock that fills the rest of the pane and scrolls a whole row
// (and column) at a time. Wrapping is the
// shell's `wrap` option, toggled for every pane from the code view's heading
// row (WrapToggle): on, a long line wraps at the pane's edge and the source
// scrolls only down; off, a long line runs on and the source scrolls across
// too. A kit that names its own code block (KitCodeBlock) shows the source
// there instead, the row's note and copy button kept, and the block follows
// the same option. Without
// source, the row says so in a word (`printing`, `unavailable`) and the box
// says why, the copy button disabled. html that leaves out what it cannot
// evaluate at rest (script-held state) says how many warnings beside the
// note, the count opening them, one to a line, in a popover
// (HtmlWarnings), as the html pane's legend does. The
// code is the controller's (`state.code`), printed as the panes change,
// so the pane follows a scenario pick, a prop edit and the editor's tree.
// The scroll area takes keyboard focus and shows it as charcell's do, its
// scrollbar's thumb climbing to the foreground. The Frame is flush, so the scroll area's bars
// run beside its ring; the row and the source keep their own cell from it.
// Styled in its index.css.
import { useEffect, useState } from 'react';
import { Button, CodeBlock, Frame, ScrollArea } from 'charcell/react/unlinked';
import type { PreviewTarget } from '../../../../../src/shell';
import { usePreviewController, usePreviewState } from '../../controller-context';
import { KitCodeBlock } from '../KitCodeBlock';
import { WRAP_OPTION } from '../../shell-options';
import { HtmlWarnings } from '../HtmlWarnings';
import './index.css';

/** How long the copy button's confirmation shows, in milliseconds. */
const COPIED_MILLISECONDS = 1500;

/** What a code pane shows: the source, or, without it, a word and why. */
interface Shown {
  text?: string;
  status?: string;
  reason?: string;
  /** What the html leaves out at rest. */
  warnings?: string[];
}

export function CodePane({ target }: { target: PreviewTarget }) {
  const code = usePreviewState((state) => state.code);
  // A kit's own code block shows the source in its place.
  const kitBlock = usePreviewController().catalog.codeBlock !== undefined;
  const wrapped = usePreviewState((state) => state.options[WRAP_OPTION] !== false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [copied]);
  // html is printed apart from the other targets, so it can be on its way or
  // not to be had; another target's code is always there.
  const { text, status, reason, warnings }: Shown = !code
    ? {}
    : target !== 'html'
      ? { text: code.targets[target] }
      : code.html.status === 'ready'
        ? { text: code.html.source, warnings: code.html.warnings }
        : code.html.status === 'loading'
          ? { status: 'printing' }
          : { status: 'unavailable', reason: code.html.reason };
  const copy = () => {
    if (text === undefined) return;
    navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => undefined,
    );
  };
  const lines = text === undefined ? 0 : text.split('\n').length - 1;
  return (
    <div className="CodePane" data-preview-code={target}>
      <Frame title={target} quiet flush fill>
        <div className="CodePane__content">
          <div className="CodePane__row">
            {/* The live region says how the code stands and that it was
                copied; the line count, which follows every edit, sits
                beside it, read but not announced. */}
            <span className="CodePane__note">
              <span role="status">{text === undefined ? (status ?? '') : copied ? `${target} copied` : ''}</span>
              {text !== undefined && !copied ? `${lines} ${lines === 1 ? 'line' : 'lines'}` : null}
            </span>
            {warnings && warnings.length > 0 ? (
              <HtmlWarnings warnings={warnings} className="CodePane__warnings" />
            ) : null}
            <span className="CodePane__actions">
              <Button variant="dense" label="copy" disabled={text === undefined} onClick={copy} />
            </span>
          </div>
          {kitBlock ? (
            <KitCodeBlock target={target} />
          ) : text !== undefined ? (
            <CodeBlock
              label={`${target} code`}
              code={text}
              wrap={wrapped}
              orientation="both"
              fill
            />
          ) : (
            <ScrollArea label={`${target} code`} overscroll="none" fill>
              <p className="CodePane__reason">{reason}</p>
            </ScrollArea>
          )}
        </div>
      </Frame>
    </div>
  );
}
