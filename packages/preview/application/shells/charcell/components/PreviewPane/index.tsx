// One preview window: a quiet charcell Frame titled by what it shows, filling its
// container, around the element the controller mounts the iframe in - a
// target's story, the story's html, or a custom view. The pane only provides that element;
// the iframe and what drives it are the controller's. A target's pane
// takes the height its story reports as its content's, so a row that starts
// at its content's height fits the story; it still fills the row it is in.
// While the controller lays the story panes out at a width (`paneWidth`), a
// target's or the html pane is that wide and as tall as its story, in a
// charcell ScrollArea: centered in a wider pane, and scrolled across, its
// scrollbar drawn in cells on a row of its own, in a narrower one, or down
// in a shorter one. A view's pane always fills its own.
// The Frame's top row holds, at its end, `reload`, which loads the pane again,
// and, on a target's pane, `open`, which opens its story as it is now in a
// window of its own. Where they do not fit beside the title they give way a
// whole cell at a time, `open` first, and go once too little of a label is
// left (fit-labels.ts), so a label is never cut through a cell. While the iframe loads, hidden until it shows its content, the
// pane says `loading` once a moment has passed (index.css). While the html
// pane has no html for the story, such as the static build's for changed
// props, the pane says why over it, as the code pane does (index.css). While
// the story's html leaves out what it cannot evaluate at rest, such as a
// part shown on a condition its script holds, the html pane's legend says how
// many warnings, the count opening them in a popover
// (HtmlWarnings), as the code pane's row does.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Button, Frame, ScrollArea } from 'charcell/react/unlinked';
import { PREVIEW_SCRIPTED_TARGETS, type PreviewScriptedTarget, type PreviewTarget } from '../../../../../src/shell';
import { usePreviewController, usePreviewState } from '../../controller-context';
import { Hint } from '../Hint';
import { HtmlWarnings } from '../HtmlWarnings';
import { fitLabels } from '../../fit-labels';
import { htmlWarningsLabel } from '../../html-warnings';
import './index.css';

/** The cells of the top row beside its title's text and its actions: the
 *  ring's corner and a cell of its stroke at each side, the cell at each side
 *  of the title, and at least one of the stroke between the two. */
const TOP_ROW_CELLS = 7;

/** How far under a whole cell a width may fall and still be that cell's. */
const CELL_TOLERANCE = 0.01;

/** The pane's whole width in cells, as it changes; `undefined` until measured. */
function useColumns(frame: RefObject<HTMLDivElement | null>, cell: RefObject<HTMLSpanElement | null>) {
  const [columns, setColumns] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => {
      const width = cell.current?.getBoundingClientRect().width;
      if (width) setColumns(Math.floor(element.getBoundingClientRect().width / width + CELL_TOLERANCE));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [frame, cell]);
  return columns;
}

export function PreviewPane(props: { title: string } & ({ target: PreviewTarget } | { viewId: string })) {
  const controller = usePreviewController();
  const element = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const cell = useRef<HTMLSpanElement>(null);
  const columns = useColumns(frame, cell);
  const target = 'target' in props ? props.target : undefined;
  const viewId = 'viewId' in props ? props.viewId : undefined;
  const height = usePreviewState((state) => (target === undefined ? undefined : state.frameSizes[target]?.height));
  const width = usePreviewState((state) => (target === undefined ? undefined : state.paneWidth));
  const fixed = width !== undefined;
  const unavailable = usePreviewState((state) =>
    target === 'html' && state.code?.html.status === 'unavailable' ? state.code.html.reason : undefined,
  );
  const warnings = usePreviewState((state) =>
    target === 'html' && state.code?.html.status === 'ready' ? state.code.html.warnings : undefined,
  );
  // A fixed pane mounts in a scroll area, a fitted one in the Frame itself:
  // the element changes between the two, so the iframe mounts again.
  useEffect(
    () =>
      target !== undefined
        ? controller.frames.mount(element.current!, target)
        : controller.frames.mountView(element.current!, viewId!),
    [controller, target, viewId, fixed],
  );
  const style = {
    ...(height === undefined ? {} : { '--preview-pane-content': `${Math.ceil(height)}px` }),
    ...(width === undefined ? {} : { '--preview-pane-width': `${width}px` }),
  } as CSSProperties;
  const actions = [
    {
      label: 'reload',
      hint: `load the ${props.title} pane again`,
      press: () => controller.frames.reload(target ?? 'view'),
    },
    ...(target !== undefined && isScriptedTarget(target)
      ? [
          {
            label: 'open',
            hint: `open the ${props.title} story in a window of its own`,
            press: () => window.open(controller.frames.standaloneUrl(target), '_blank'),
          },
        ]
      : []),
  ];
  const warningsLabel = warnings && warnings.length > 0 ? htmlWarningsLabel(warnings) : undefined;
  const titleCells = [...props.title].length + (warningsLabel === undefined ? 0 : warningsLabel.length + 1);
  const fitted = fitLabels(
    actions.map((action) => action.label),
    columns === undefined ? undefined : columns - titleCells - TOP_ROW_CELLS,
  );
  return (
    <div ref={frame} className="PreviewPane__frame">
      <span ref={cell} className="PreviewPane__cell" aria-hidden="true" />
      <Frame
        title={props.title}
        quiet
        flush
        fill
        legend={
          warnings && warnings.length > 0 ? (
            <HtmlWarnings
              warnings={warnings}
              className="PreviewPane__warnings"
              attributes={{ 'data-preview-html-warnings': '' }}
            />
          ) : undefined
        }
        legendEnd={
          fitted.length > 0 ? (
            <span className="PreviewPane__actions">
              {fitted.map((text, index) => {
                const action = actions[index]!;
                return (
                  <Hint key={action.label} text={action.hint}>
                    {(hint) => (
                      <Button
                        {...hint}
                        variant="dense"
                        label={text}
                        aria-label={action.label}
                        onClick={action.press}
                      />
                    )}
                  </Hint>
                );
              })}
            </span>
          ) : undefined
        }
      >
      {fixed ? (
        <ScrollArea label={`${props.title} story`} orientation="both" overscroll="none" fill>
          <div ref={element} key="fixed" className="PreviewPane PreviewPane--fixed" style={style}>
            {note(unavailable)}
          </div>
        </ScrollArea>
      ) : (
        <div ref={element} key="fitted" className="PreviewPane" style={style}>
          {note(unavailable)}
        </div>
      )}
      </Frame>
    </div>
  );
}

/** The note over the html pane saying why it has no html, beside the
 *  iframe the controller mounts in the same element. */
function note(reason: string | undefined) {
  return reason === undefined ? null : (
    <p className="PreviewPane__note" role="status" data-preview-html-note="">
      {reason}
    </p>
  );
}

/** Whether a target is a scripted one, whose pane can open on its own (the
 *  html pane shows the markup its host gives it). */
function isScriptedTarget(target: PreviewTarget): target is PreviewScriptedTarget {
  return (PREVIEW_SCRIPTED_TARGETS as readonly string[]).includes(target);
}
