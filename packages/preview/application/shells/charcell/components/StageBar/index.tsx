// The stage bar, over a component story or a custom view: what is on the
// stage and how it is set up. At its start `component` (`view` on a custom view), a combobox of everything the
// navigation lists (the selected entry too, when it is unlisted), narrowed
// as the reader types, as wide as its longest entry and titled with the
// selected one's label, with an info button for the component's
// description; at its end, the options a kit places in the stage bar and its
// `stage-bar-end` slot, both empty by default. The scenario picker is the
// scenario row's (ScenarioRow), and the context options the output view's
// (ViewControls). The bar's rule row is left empty, so no line crosses the
// navigation's. Styled in its index.css.
import { Combobox, Field } from 'charcell/react/unlinked';
import { useId } from 'react';
import type { PreviewCatalog, PreviewNavigationNode } from '../../../../../src/shell';
import { usePreviewController, usePreviewState } from '../../controller-context';
import { Bar } from '../Bar';
import { Description } from '../Description';
import { OptionControls } from '../OptionControls';
import type { SelectOption } from '../Select';
import { SlotOutlet } from '../SlotOutlet';
import './index.css';

export function StageBar() {
  const controller = usePreviewController();
  const selection = usePreviewState((state) => state.selection);
  const { catalog } = controller;
  const selected =
    selection.kind === 'view' ? undefined : catalog.components.find((component) => component.id === selection.id);
  const entries = stageEntries(catalog, selection);
  const current = entries.find((entry) => entry.value === entryValue(selection))?.label;
  const findId = useId();
  return (
    <Bar
      unruled
      flush
      end={
        <>
          <OptionControls placement="stage-bar" />
          <SlotOutlet name="stage-bar-end" />
        </>
      }
    >
      <span className="StageBar__pick">
        <Field label={selection.kind === 'view' ? 'view' : 'component'} htmlFor={findId}>
          <Combobox
            variant="dense"
            id={findId}
            items={entries}
            value={entryValue(selection)}
            onValueChange={(value) => controller.actions.select(entryOf(value))}
            inputProps={{ 'data-testid': 'select-component', title: current }}
            style={{ width: pickerWidth(entries) }}
          />
        </Field>
        <Description text={selected?.description} label={`about ${selected?.shortTitle ?? 'the component'}`} />
      </span>
    </Bar>
  );
}

type Entry = { kind: 'component' | 'view'; id: string };

/** The cells a picker's field takes beside its text: a cell of padding at
 *  each end, the cell between the text and its `▾`, and the `▾`. */
const CELLS_BESIDE_TEXT = 4;

/** The width the picker's field takes: its text as wide as the longest
 *  entry, and never narrower than charcell's own 20 cells, so no name is
 *  cut short and the field keeps its width as the reader moves between
 *  entries. */
function pickerWidth(entries: SelectOption[]): string {
  const longest = Math.max(20, ...entries.map((entry) => [...entry.label].length));
  return `${longest + CELLS_BESIDE_TEXT}ch`;
}

/** A select value for a navigation entry: a view's id and a component's may coincide. */
function entryValue(entry: Entry): string {
  return `${entry.kind}:${entry.id}`;
}

function entryOf(value: string): Entry {
  const separator = value.indexOf(':');
  return { kind: value.slice(0, separator) as Entry['kind'], id: value.slice(separator + 1) };
}

/** Every entry the navigation lists, in its order, components by their short
 *  title; the selection too, where the navigation leaves it out. */
function stageEntries(catalog: PreviewCatalog, selection: Entry): SelectOption[] {
  const entries: SelectOption[] = [];
  const shortTitle = (id: string) => catalog.components.find((component) => component.id === id)?.shortTitle ?? id;
  const walk = (nodes: PreviewNavigationNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'group') walk(node.children);
      else
        entries.push({
          value: entryValue(node),
          label: node.kind === 'component' ? shortTitle(node.id) : node.label,
        });
    }
  };
  walk(catalog.navigation);
  if (!entries.some((entry) => entry.value === entryValue(selection))) {
    const view = catalog.views.find((candidate) => candidate.id === selection.id);
    entries.push({
      value: entryValue(selection),
      label: selection.kind === 'view' ? (view?.label ?? selection.id) : shortTitle(selection.id),
    });
  }
  return entries;
}
