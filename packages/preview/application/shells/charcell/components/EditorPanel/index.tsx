// The scenario editor: compose a component's content as an editable node tree and
// see it rendered live across React, Vue and Svelte. The tree and every operation
// on it are the controller's (`controller.editor`): a structural edit regenerates
// the scratch story through it and reloads the panes. State is in-session only;
// nothing writes back to the story files.
//
// The root is the story's component, picked in the stage bar: named on its
// first row, with no picker and no grip, its props and content start
// directly in the scenario row's Frame, with no ring of their own. Each nested node is a charcell Frame with a picker and a remove control
// on its first row. A node's props and each of its slots, the default
// included, are windows under it: a quiet Frame titled `props` or
// `slot: <name>`, its one action in the legend - `expand` or `collapse` - the
// props starting collapsed and the slots open. The add dialog closes the
// node. Reordering is charcell's SortableGroup, resolved through the
// controller's `resolveDrop`. Styled in its index.css.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  Button,
  Frame,
  SortableGroup,
  SortableList,
  TextInput,
  type SortableMove,
} from 'charcell/react/unlinked';
import {
  type AroundFill,
  childPath,
  nodeAt,
  nodeAddSlots,
  nodeSlots,
  type ContainerNode,
  type DropTarget,
  type EditorNode,
  type NodePath,
  type OpaqueFill,
  type PreviewPropType,
  type SortableListAddress,
  type Step,
} from '../../../../../src/shell';
import { usePreviewController, usePreviewState } from '../../controller-context';
import { Control } from '../Control';
import { EditorAddDialog } from '../EditorAddDialog';
import { Hint } from '../Hint';
import { Select } from '../Select';
import './index.css';

type Json = unknown;

/** A path as a string, for keys and the collapsed sets: `root`, or
 *  `default:0/header:1`. */
function pathKey(path: NodePath): string {
  return path.length === 0 ? 'root' : path.map((step) => `${step.slot}:${step.index}`).join('/');
}

// --- the panel --------------------------------------------------------------

export function EditorPanel() {
  const controller = usePreviewController();
  const { components, htmlTags } = controller.catalog;
  const tree = usePreviewState((state) => state.editor.tree);
  // The root's props are the story's: the state holds them beside the tree.
  const rootProps = usePreviewState((state) => state.props);
  // The content the story renders beside the root: the story's own, shown
  // locked outside the tree.
  const selection = usePreviewState((state) => state.selection);
  const around =
    selection.kind === 'component'
      ? components.find((candidate) => candidate.id === selection.id)?.around
      : undefined;
  const byName = (name: string) => components.find((candidate) => candidate.name === name);
  // The name to show in the tree/picker: a component's display leaf (its title's last
  // segment), which differs from the preview `name` only for another package's aliased export
  // (`NoticeToast` → "Toast"). Core components' leaf equals their name.
  const displayName = (name: string) => byName(name)?.title.split('/').pop() ?? name;

  // Path-keyed: which nodes have their props panel expanded.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // Reordering is charcell's SortableGroup: every slot's children are one
  // SortableList, named by its parent's path and the slot, and a move between
  // or within them resolves through the controller. Root is never draggable.
  const lists = useRef(new Map<string, SortableListAddress>());
  function onMove({ from, to }: SortableMove) {
    const source = lists.current.get(from.list);
    const target = lists.current.get(to.list);
    if (!source || !target) return;
    const move = controller.editor.resolveDrop({
      source,
      target,
      sameList: from.list === to.list,
      fromIndex: from.index,
      toIndex: to.index,
    });
    controller.editor.move(move.from, move.to);
  }

  // Test hook, on the dev server only: drive a move programmatically (the same
  // resolver a drop uses) so an end-to-end spec can assert how a move resolves
  // and regenerates without simulating a drag.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __previewEditorMove?: (from: Step[], target: DropTarget) => void }).__previewEditorMove = (
      from,
      target,
    ) => controller.editor.move(from, target);
    return () => {
      delete (window as unknown as { __previewEditorMove?: unknown }).__previewEditorMove;
    };
  }, [controller]);

  function toggleExpanded(path: NodePath) {
    const key = pathKey(path);
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Collapsed slot content, keyed by `${pathKey(path)}#${slot}` - hides a slot's
  // children (a named slot's legend toggle, or a default-only node's header toggle).
  const [collapsedContent, setCollapsedContent] = useState<Set<string>>(() => new Set());
  const contentKey = (path: NodePath, slot: string) => `${pathKey(path)}#${slot}`;
  const isContentCollapsed = (path: NodePath, slot: string) => collapsedContent.has(contentKey(path, slot));
  function toggleContent(path: NodePath, slot: string) {
    const key = contentKey(path, slot);
    setCollapsedContent((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (!tree) return null;
  const state = tree;

  // One prop of a node changes: the node's props are set whole, the root's
  // as the story's props (live, no regeneration, its content left as it is),
  // a nested node's baked into the generated template (a regeneration).
  function updateProp(path: Step[], current: Record<string, Json>, name: string, value: Json) {
    const props = { ...current };
    if (value === undefined) delete props[name];
    else props[name] = value;
    controller.editor.setNodeProps(path, props);
  }

  function addChild(path: NodePath, slot: string, child: EditorNode) {
    controller.editor.insert({ parent: path, slot }, child);
  }

  function swapComponent(path: Step[], name: string) {
    if (!byName(name)) return;
    controller.editor.replace(path, controller.editor.createNode({ kind: 'component', name, importAs: 'default' }));
  }

  // Render one element, or the root's props and content unwrapped, recursing
  // into its content. `gripNode` is the node's grip, placed by its slot's
  // SortableList (absent for the root).
  function renderElement(
    path: NodePath,
    component: string,
    propValues: Record<string, Json>,
    gripNode?: React.ReactNode,
  ): React.ReactNode {
    const isRoot = path.length === 0;
    const node = isRoot ? null : nodeAt(state.slots, path);
    // The slots the node holds, the default first.
    const options = nodeSlots(controller.catalog, node ?? state);
    // The slots plain content can go in: not one whose content must take its scope.
    const addOptions = nodeAddSlots(controller.catalog, node ?? state);
    // No props ⇒ no props window.
    const propTypes = byName(component)?.propTypes ?? [];
    const hasProps = propTypes.some((propType) => propType.include);

    const body = (
      <>
        {hasProps && renderProps(path, propTypes, propValues)}
        {renderSlots(path, options)}
        {addOptions.length > 0 && (
          <div className="EditorPanel__add">
            <EditorAddDialog slots={addOptions} onAdd={(slot, child) => addChild(path, slot, child)} />
          </div>
        )}
      </>
    );
    // The root is the stage bar's pick: named on a row of its own, no picker
    // and no grip.
    if (isRoot)
      return (
        <>
          <div className="EditorPanel__row">
            <span className="EditorPanel__label">component</span>
            <span>{displayName(component)}</span>
          </div>
          {body}
        </>
      );
    return (
      <NodeFrame>
        <div className="EditorPanel__row">
          {gripNode}
          <span className="EditorPanel__label">component</span>
          <Select
            value={component}
            onChange={(name) => swapComponent(path, name)}
            options={components
              // An unlisted story is not offered, unless it is the node's own.
              .filter((candidate) => !candidate.unlisted || candidate.name === component)
              .map((candidate) => ({ value: candidate.name, label: displayName(candidate.name) }))}
          />
          {removeButton(path)}
        </div>
        {body}
      </NodeFrame>
    );
  }

  // A node's props window: collapsed to its ring until expanded.
  function renderProps(path: NodePath, propTypes: PreviewPropType[], propValues: Record<string, Json>): React.ReactNode {
    const open = expanded.has(pathKey(path));
    return (
      <Frame
        as="div"
        quiet
        title="props"
        legend={
          <Button
            variant="dense"
            data-editor-window="props"
            aria-label={`${open ? 'collapse' : 'expand'} the props`}
            label={open ? 'collapse' : 'expand'}
            onClick={() => toggleExpanded(path)}
          />
        }
      >
        {open && (
          <NodeControls
            propTypes={propTypes}
            values={propValues}
            onChange={(name, value) => updateProp(path, propValues, name, value)}
          />
        )}
      </Frame>
    );
  }

  // A node's slots, the default first, each a window of its children; a
  // slot with children collapses to its ring.
  function renderSlots(path: NodePath, slotNames: string[]): React.ReactNode {
    const isRoot = path.length === 0;
    const node = isRoot ? null : (nodeAt(state.slots, path) as ContainerNode | null);
    const slots = isRoot ? state.slots : node?.slots ?? {};
    return slotNames.map((slot) => {
      const collapsed = isContentCollapsed(path, slot);
      const hasChildren = (slots[slot] ?? []).length > 0;
      return (
        <Frame
          key={slot}
          as="div"
          quiet
          title={`slot: ${slot}`}
          legend={
            hasChildren ? (
              <Button
                variant="dense"
                data-editor-window={`slot: ${slot}`}
                aria-label={`${collapsed ? 'expand' : 'collapse'} the ${slot} slot`}
                label={collapsed ? 'expand' : 'collapse'}
                onClick={() => toggleContent(path, slot)}
              />
            ) : undefined
          }
        >
          {!collapsed && renderNodes(path, slot, slots[slot] ?? [])}
        </Frame>
      );
    });
  }

  function removeButton(path: Step[]): React.ReactNode {
    return (
      <span className="EditorPanel__remove">
        <Button variant="dense" data-editor-remove label="remove" onClick={() => controller.editor.remove(path)} />
      </span>
    );
  }

  // Render a slot's children as one of the group's sortable lists. Each node
  // places its own grip in its header row, and lifts (a double right and
  // bottom border) while dragged; the hole it leaves is where it lands. An
  // empty slot offers charcell's own place and drop rows while a node is
  // picked up or dragged.
  function renderNodes(parent: NodePath, slot: string, nodes: EditorNode[]): React.ReactNode {
    const listId = `${pathKey(parent)}#${slot}`;
    lists.current.set(listId, { parent, slot });
    return (
      <SortableList
        id={listId}
        items={nodes}
        getKey={(node) => node.id!}
        customGrip
      >
        {({ item: node, index, dragging, gripProps }) => {
          const path = childPath(parent, slot, index);
          const grip = (
            <Hint text="drag to move" triggerProps={{ ...gripProps }}>
              {(props) => <button {...props} />}
            </Hint>
          );
          return (
            <LiftContext.Provider value={dragging}>
              {node.kind === 'text'
                ? renderText(path, node.value, grip)
                : node.kind === 'html'
                  ? renderHtmlNode(path, node, grip)
                  : node.kind === 'opaque'
                    ? renderOpaque(path, node.fill, grip)
                    : renderElement(path, node.component, node.props, grip)}
            </LiftContext.Provider>
          );
        }}
      </SortableList>
    );
  }

  // A plain HTML tag (e.g. `<p>`/`<section>` wrappers): a tag picker and no
  // props, its default slot's window, and the add dialog.
  function renderHtmlNode(path: Step[], node: Extract<EditorNode, { kind: 'html' }>, gripNode?: React.ReactNode): React.ReactNode {
    const options = nodeSlots(controller.catalog, node);
    return (
      <NodeFrame>
        <div className="EditorPanel__row">
          {gripNode}
          <span className="EditorPanel__label">html tag</span>
          <Select
            value={node.tag}
            onChange={(tag) => controller.editor.replace(path, { ...node, tag })}
            // A story file may author a tag outside the picker's list - keep the
            // select truthful by prepending the node's actual tag.
            options={(htmlTags.includes(node.tag) ? htmlTags : [node.tag, ...htmlTags]).map(
              (tag) => ({ value: tag, label: tag }),
            )}
          />
          {removeButton(path)}
        </div>
        {renderSlots(path, options)}
        <div className="EditorPanel__add">
          <EditorAddDialog slots={options} onAdd={(slot, child) => addChild(path, slot, child)} />
        </div>
      </NodeFrame>
    );
  }

  // A `raw` or `scoped` fill or a call to a part from the story file: per-target
  // source the editor cannot author, so it is locked - labeled with its kind,
  // moved or removed like any node, and saved back verbatim. The React body
  // stands in for all three targets.
  function renderOpaque(path: Step[], fill: OpaqueFill, gripNode?: React.ReactNode): React.ReactNode {
    const summary =
      fill.kind === 'scoped'
        ? `(${fill.parameters.join(', ')}) => ${fill.react}`
        : fill.kind === 'part'
          ? `${fill.name}({ ${fill.parameters.join(', ')} }) => ${fill.react}`
          : fill.react;
    return (
      <NodeFrame>
        <div className="EditorPanel__row">
          {gripNode}
          <span className="EditorPanel__label">{fill.kind}</span>
          <Hint text={summary}>
            {(hint) => (
              <code {...hint} className="EditorPanel__opaque">
                {summary}
              </code>
            )}
          </Hint>
          {removeButton(path)}
        </div>
      </NodeFrame>
    );
  }

  // What the story renders beside the root, before or after it: locked, as
  // the story gives it, outside the root's content, so no edit reaches it.
  function renderBeside(where: 'before' | 'after', fill: AroundFill): React.ReactNode {
    const summary = besideSummary(fill);
    return (
      <NodeFrame>
        <div className="EditorPanel__row" data-preview-editor-beside={where}>
          <span className="EditorPanel__label">{where}</span>
          <Hint text={summary}>
            {(hint) => (
              <code {...hint} className="EditorPanel__opaque">
                {summary}
              </code>
            )}
          </Hint>
        </div>
      </NodeFrame>
    );
  }

  function renderText(path: Step[], value: string, gripNode?: React.ReactNode): React.ReactNode {
    return (
      <NodeFrame key={pathKey(path)}>
        <div className="EditorPanel__row">
          {gripNode}
          <span className="EditorPanel__label">text</span>
          <TextInput
            variant="dense"
            type="text"
            aria-label="text"
            value={value}
            onChange={(event) => controller.editor.setText(path, event.target.value)}
          />
          {removeButton(path)}
        </div>
      </NodeFrame>
    );
  }

  return (
    <SortableGroup onMove={onMove}>
      <div className="EditorPanel" data-preview-editor>
        {around?.before && renderBeside('before', around.before)}
        {renderElement([], state.root, rootProps)}
        {around?.after && renderBeside('after', around.after)}
      </div>
    </SortableGroup>
  );
}

/** Content beside the root on one line: its text, its tags and components
 *  as `<name>`, and a raw fill's or a part's React body. */
function besideSummary(fill: AroundFill): string {
  switch (fill.kind) {
    case 'text':
      return fill.value;
    case 'html':
      return `<${fill.tag}>${fill.children && fill.children.kind !== 'scoped' ? besideSummary(fill.children) : ''}`;
    case 'element':
      return `<${fill.component}>${fill.children && fill.children.kind !== 'scoped' ? besideSummary(fill.children) : ''}`;
    case 'fragment':
      return fill.children
        .filter((child): child is AroundFill => child.kind !== 'scoped')
        .map(besideSummary)
        .join(' ');
    case 'raw':
      return fill.react;
    case 'part':
      return `${fill.name}({ ${fill.parameters.join(', ')} })`;
  }
}

// One editor node: a quiet charcell Frame, as its props and slots windows
// are, so no level inside the scenario row's Frame outshines what groups it.
// The node being dragged is raised: its outermost Frame takes a double end
// and bottom border, and nothing nested inside it.
const LiftContext = createContext(false);

function NodeFrame(props: { children: React.ReactNode }) {
  const lifted = useContext(LiftContext);
  return (
    <Frame
      as="div"
      quiet
      borderEnd={lifted ? 'double' : undefined}
      borderBottom={lifted ? 'double' : undefined}
    >
      <LiftContext.Provider value={false}>{props.children}</LiftContext.Provider>
    </Frame>
  );
}

function NodeControls(props: {
  propTypes: PreviewPropType[];
  values: Record<string, Json>;
  onChange: (name: string, value: Json) => void;
}) {
  const controls = props.propTypes.filter((propType) => propType.include);
  if (controls.length === 0) return null; // no props ⇒ render nothing (the toggle is hidden too)
  return (
    <div className="EditorPanel__controls">
      {controls.map((propType) => (
        <Control
          key={propType.name}
          propType={propType}
          value={props.values[propType.name]}
          onChange={(value) => props.onChange(propType.name, value)}
        />
      ))}
    </div>
  );
}
