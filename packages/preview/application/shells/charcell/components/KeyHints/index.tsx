// The shell's keys, and the hint of them at the end of the status bar:
// `/ find  ? keys`, the second opening the list of them in a charcell Popover.
// A key acts while no field takes the typing - a text input, a select's
// list, the editor, the navigation's tree, whose rows a typed letter finds - and
// no pane holds the focus (a pane's keys are its story's); with Ctrl, Alt or
// Meta held it is the browser's.
//
//   /     find a component (the component combobox, its text selected)
//   n     show or hide the navigation
//   s o c e  show or hide the scenario, output, code and events views
//   1-n   show or hide the targets, in the top bar's order (the kit's
//         targets numbered, 1-3 for three)
//   w     wrap the code panes' lines, or not
//   ?     the list of keys
//
// The list also names Enter on a focused split handle, which puts the split
// back where it started (split-reset.ts, as a double-click on it does); the
// handle takes it, not this listener.
//
// Views and targets follow the narrow layout's one-at-a-time rule
// (stage-toggles.ts). Styled in its index.css.
import { Button, Popover } from 'charcell/react/unlinked';
import { Hint } from '../Hint';
import { useEffect, useState } from 'react';
import { usePreviewController } from '../../controller-context';
import { NAVIGATION_OPTION, WRAP_OPTION } from '../../shell-options';
import { toggleTarget, toggleView, useNarrow, VIEW_OPTIONS } from '../../stage-toggles';
import './index.css';

/** The keys, as the list shows them. */
function keys(targets: number): [string, string][] {
  return [
    ['/', 'find a component'],
    ['n', 'show or hide the navigation'],
    ['s o c e', 'show or hide the scenario, output, code and events views'],
    [targets > 1 ? `1-${targets}` : '1', targets > 1 ? 'show or hide the targets' : 'show or hide the target'],
    ['w', 'wrap the code panes’ lines, or not'],
    ['enter', 'on a split handle, put the split back where it started (or double-click it)'],
    ['?', 'this list'],
  ];
}

/** Whether a key pressed with focus on `target` is the field's to take. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('input, textarea, select, [role="listbox"], [role="combobox"], [role="dialog"], [role="tree"]')) return true;
  return false;
}

export function KeyHints() {
  const controller = usePreviewController();
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented) return;
      if (typing(event.target)) return;
      const state = controller.getState();
      const viewKey = { s: 0, o: 1, c: 2, e: 3 }[event.key];
      if (event.key === '/') {
        // The component combobox, its text selected: typing replaces the
        // current name and opens the list, narrowed to the matches.
        const find = document.querySelector<HTMLInputElement>('[data-testid="select-component"]');
        if (!find) return;
        find.focus();
        find.select();
      } else if (event.key === '?') setOpen((shown) => !shown);
      else if (viewKey !== undefined) toggleView(controller, VIEW_OPTIONS[viewKey], narrow);
      else if (/^[1-9]$/.test(event.key)) {
        const target = controller.catalog.targets[Number(event.key) - 1];
        if (!target) return;
        toggleTarget(controller, target, narrow);
      } else if (event.key === 'n') controller.actions.setOption(NAVIGATION_OPTION, state.options[NAVIGATION_OPTION] === false);
      else if (event.key === 'w') controller.actions.setOption(WRAP_OPTION, state.options[WRAP_OPTION] === false);
      else return;
      event.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, narrow]);
  return (
    <span className="KeyHints">
      <span className="KeyHints__hint">/ find</span>
      <Popover
        label="keys"
        open={open}
        onOpenChange={setOpen}
        trigger={({ triggerProps }) => (
          <Hint text="the shell's keys" triggerProps={triggerProps}>
            {(props) => <Button variant="dense" label="? keys" {...props} />}
          </Hint>
        )}
      >
        <dl className="KeyHints__list">
          {keys(controller.catalog.targets.length).map(([key, meaning]) => (
            <div key={key} className="KeyHints__entry">
              <dt className="KeyHints__key">{key}</dt>
              <dd className="KeyHints__meaning">{meaning}</dd>
            </div>
          ))}
        </dl>
      </Popover>
    </span>
  );
}
