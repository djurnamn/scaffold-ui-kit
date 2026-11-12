// The output's `width` select, among the output's options with the kit's
// own (ViewControls): `fit`, the panes sharing the stage's width, or one of
// the catalog's pane widths, such as `medium 768`, which lays every story
// pane out that wide so a component that responds to its width shows as it
// does on such a screen. The output stacks its panes as rows while the width
// is wider than a column would be (PreviewGrid), and a row still narrower
// scrolls across (PreviewPane). A width a link names that is not among them
// shows as its number. The controller keeps the choice, and the address with
// it (`width=768`). With no pane widths in the catalog and none chosen there
// is nothing to pick, and no select.
import { usePreviewController, usePreviewState } from '../../controller-context';
import { Select, type SelectOption } from '../Select';

/** The select's value while the panes fit the stage. */
const FIT = 'fit';

/** Whether there is a width to pick: the catalog offers some, or one is
 *  chosen. */
export function usePaneWidthShown(): boolean {
  const controller = usePreviewController();
  const paneWidth = usePreviewState((state) => state.paneWidth);
  return controller.catalog.paneWidths.length > 0 || paneWidth !== undefined;
}

export function PaneWidth() {
  const controller = usePreviewController();
  const paneWidth = usePreviewState((state) => state.paneWidth);
  const paneWidths = controller.catalog.paneWidths;
  if (paneWidths.length === 0 && paneWidth === undefined) return null;
  const options: SelectOption[] = [
    { value: FIT, label: FIT },
    ...paneWidths.map(({ label, width }) => ({ value: String(width), label: `${label} ${width}` })),
  ];
  if (paneWidth !== undefined && !paneWidths.some(({ width }) => width === paneWidth))
    options.push({ value: String(paneWidth), label: String(paneWidth) });
  return (
    <Select
      label="width"
      testId="select-pane-width"
      value={paneWidth === undefined ? FIT : String(paneWidth)}
      onChange={(value) => controller.actions.setPaneWidth(value === FIT ? undefined : Number(value))}
      options={options}
    />
  );
}
