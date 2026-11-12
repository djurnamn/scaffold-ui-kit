// The editor's add-content control: a charcell Popover whose trigger is the
// `add...` button and whose content is the add form - pick the kind (text,
// component or html tag), the value (the text, which component, or a tag),
// the scenario a component comes in at, and - only when there is a choice -
// which slot to add into. The node itself is the controller's to make
// (`editor.createNode`); the form only gathers the request.
import { useId, useState } from 'react';
import { Portal } from '@zag-js/react';
import { Button, Field, PopoverDriver, PopoverPanel, TextInput } from 'charcell/react/unlinked';
import { Hint } from '../Hint';
import { DEFAULT_SLOT, type EditorNode, type PreviewNodeRequest } from '../../../../../src/shell';
import { usePreviewController } from '../../controller-context';
import { Select } from '../Select';
import './index.css';

type Kind = 'text' | 'component' | 'html';

export function EditorAddDialog(props: { slots: string[]; onAdd: (slot: string, child: EditorNode) => void }) {
  const { slots, onAdd } = props;
  const controller = usePreviewController();
  const { htmlTags } = controller.catalog;
  // An unlisted story is not offered: it is reachable at its address alone.
  const components = controller.catalog.components.filter((candidate) => !candidate.unlisted);
  const [open, setOpen] = useState(false);
  const textId = useId();
  const [kind, setKind] = useState<Kind>('text');
  const [text, setText] = useState('text');
  const [tag, setTag] = useState(htmlTags[0]);
  const [component, setComponent] = useState(components[0]?.name ?? '');
  // Which configuration a component comes in at - `empty` (the default: a blank
  // node), `default` (the curated defaults and slot content), or a named scenario.
  const [importAs, setImportAs] = useState('empty');
  const [slot, setSlot] = useState(slots[0] ?? DEFAULT_SLOT);

  const found = components.find((candidate) => candidate.name === component);
  // The baseline scenario (its label names the "default" option) and the rest the
  // dialog offers - excluding the preview's `empty` and the `default` one.
  const defaultScenario = (found?.scenarios ?? []).find((scenario) => scenario.default);
  const namedScenarios = (found?.scenarios ?? []).filter((scenario) => !scenario.empty && !scenario.default);
  // "Empty" is a composable-content concept: the scenario choice is offered only
  // when the component has slot content to strip (or a named scenario). A
  // content-less component (an icon) comes in at its default.
  const hasImportChoice =
    !!found && (found.slots.default || found.slots.named.length > 0 || namedScenarios.length > 0);

  function add() {
    let request: PreviewNodeRequest | null = null;
    if (kind === 'text') request = { kind: 'text', value: text };
    else if (kind === 'html') request = { kind: 'html', tag };
    else if (found) {
      request = {
        kind: 'component',
        name: found.name,
        importAs:
          importAs === 'empty' || importAs === 'default' ? importAs : { scenario: importAs.replace(/^scenario:/, '') },
      };
    }
    if (request) onAdd(slot, controller.editor.createNode(request));
    setOpen(false);
  }

  // charcell's PopoverDriver and Visuals composed directly (controlled open):
  // the same escape hatch as the panes. The positioner is the dialog's own
  // element. The panel is at least 32 cells wide and grows past that with its
  // content, for a long component name.
  return (
    <PopoverDriver open={open} onOpenChange={setOpen}>
      {({ api }) => (
        <>
          <Hint text="add content" triggerProps={api.getTriggerProps()}>
            {(props) => <Button variant="dense" label="add…" {...props} />}
          </Hint>
          {api.open && (
            <Portal>
              <div className="EditorAddDialog" {...api.getPositionerProps()}>
                <PopoverPanel minWidth={32} {...api.getContentProps()} data-preview-dialog>
                  <p>
                    <Select
                      label="kind"
                      testId="add-dialog-kind"
                      value={kind}
                      onChange={(value) => setKind(value as Kind)}
                      options={[
                        { value: 'text', label: 'text' },
                        { value: 'component', label: 'component' },
                        { value: 'html', label: 'html tag' },
                      ]}
                    />
                  </p>
                  <p>
                    {kind === 'text' ? (
                      <Field label="value" htmlFor={textId}>
                        <TextInput
                          id={textId}
                          variant="dense"
                          type="text"
                          value={text}
                          onChange={(event) => setText(event.target.value)}
                        />
                      </Field>
                    ) : kind === 'html' ? (
                      <Select
                        label="tag"
                        testId="add-dialog-tag"
                        value={tag}
                        onChange={setTag}
                        options={htmlTags.map((tag) => ({ value: tag, label: tag }))}
                      />
                    ) : (
                      <Select
                        label="component"
                        testId="add-dialog-component"
                        value={component}
                        onChange={(value) => {
                          setComponent(value);
                          setImportAs('empty');
                        }}
                        options={components.map((candidate) => ({ value: candidate.name, label: candidate.name }))}
                      />
                    )}
                  </p>
                  {kind === 'component' && hasImportChoice && (
                    <p>
                      <Select
                        label="scenario"
                        testId="add-dialog-scenario"
                        value={importAs}
                        onChange={setImportAs}
                        options={[
                          { value: 'empty', label: 'empty' },
                          { value: 'default', label: defaultScenario?.label ?? 'default' },
                          ...namedScenarios.map((scenario) => ({ value: `scenario:${scenario.id}`, label: scenario.label })),
                        ]}
                      />
                    </p>
                  )}
                  {slots.length > 1 && (
                    <p>
                      <Select
                        label="slot"
                        testId="add-dialog-slot"
                        value={slot}
                        onChange={setSlot}
                        options={slots.map((slot) => ({ value: slot, label: slot }))}
                      />
                    </p>
                  )}
                  <Button variant="dense" label="add" onClick={add} />{' '}
                  <Button variant="dense" label="cancel" onClick={() => setOpen(false)} />
                </PopoverPanel>
              </div>
            </Portal>
          )}
        </>
      )}
    </PopoverDriver>
  );
}
