// The editor's node tree: its immutable path operations, seeding, and its round
// trip through the story file's slot fills, kept free of React so it can be tested
// beside the emitters. A story file's SlotPlan seeds the tree (fillToNodes); every
// structural edit goes through the path operations below and serializes back
// into the regeneration payload (toPayload).
import type {
  AroundFill,
  JsonValue,
  SlotFill,
  SlotPlan,
  StoryAround,
} from '../lib/types.js';

export type { AroundFill, SlotFill, SlotPlan, StoryAround };

type Json = unknown;

/** A fill the editor cannot author: a `raw` body, a `scoped` slot or a
 *  `part` call, each per-target strings. It is held verbatim, so it can be
 *  moved or removed but not edited, and serializes back unchanged. */
export type OpaqueFill = Extract<SlotFill, { kind: 'raw' | 'scoped' | 'part' }>;

// The editor's authoring shape: a real component (props + content keyed by
// slot), a plain HTML tag (default slot only), a text leaf, or an opaque fill.
// `slots.default` is the default-slot children; other keys are named slots
// (elements only - HTML tags carry no named slots). `id` is the node's identity
// while the editor holds it (the sortable key that travels with it between
// slots); `toPayload` leaves it out, and `ensureIds` gives one to any node
// created without.
export type EditorNode =
  | { kind: 'text'; value: string; id?: string }
  | {
      kind: 'element';
      component: string;
      props: Record<string, Json>;
      slots: Record<string, EditorNode[]>;
      id?: string;
    }
  | {
      kind: 'html';
      tag: string;
      props: Record<string, Json>;
      slots: Record<string, EditorNode[]>;
      id?: string;
    }
  | { kind: 'opaque'; fill: OpaqueFill; id?: string };

/** A node that holds content of its own: an element or an HTML tag. */
export type ContainerNode = Extract<EditorNode, { kind: 'element' | 'html' }>;

export function isContainer(node: EditorNode): node is ContainerNode {
  return node.kind === 'element' || node.kind === 'html';
}

export const DEFAULT_SLOT = 'default';

/** The plain wrapper tags an HTML node can be, picked from a list rather than
 *  typed: the layout and content elements a slot fill might need around its
 *  children. */
export const HTML_TAGS = [
  'div',
  'section',
  'article',
  'aside',
  'header',
  'footer',
  'main',
  'nav',
  'p',
  'span',
  'strong',
  'em',
  'small',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
];

let nodeIdCounter = 0;
/** Gives every node in the content an id, in place: idempotent, and the spreads
 *  every update makes carry a node's id along. */
export function ensureIds(content: Record<string, EditorNode[]>): void {
  for (const list of Object.values(content)) {
    for (const node of list) {
      if (!node.id) node.id = `editor-node-${nodeIdCounter++}`;
      if (isContainer(node)) ensureIds(node.slots);
    }
  }
}

/** The root's state: its component, its props and its content keyed by
 *  slot. The content the story renders beside the root is not the tree's: it
 *  is the story's (`PreviewComponent.around`), which no edit reaches. */
export interface EditorState {
  root: string;
  props: Record<string, Json>;
  slots: Record<string, EditorNode[]>;
}

// --- paths and tree operations (immutable) ----------------------------------

/** One hop into a slot: which slot, and the node's index in it. */
export interface Step {
  slot: string;
  index: number;
}

/** A node's address: the hops from the root, one per slot it descends into.
 *  The empty path `[]` addresses the root itself. */
export type NodePath = Step[];

/** Where a move lands: into `slot` of the node at `parent`, before `index`
 *  (counted before the moved node is removed). */
export interface DropTarget {
  parent: Step[];
  slot: string;
  index: number;
}

/** Apply `transform` to the node at `path` (path must be non-empty). */
export function updateAt(
  content: Record<string, EditorNode[]>,
  path: Step[],
  transform: (node: EditorNode) => EditorNode
): Record<string, EditorNode[]> {
  const [step, ...rest] = path;
  const list = content[step.slot] ?? [];
  const nextList = list.map((node, index) => {
    if (index !== step.index) return node;
    if (rest.length === 0) return transform(node);
    if (!isContainer(node)) return node;
    return { ...node, slots: updateAt(node.slots, rest, transform) };
  });
  return { ...content, [step.slot]: nextList };
}

/** Insert `child` into `slot` of the node at `parentPath` (empty path = the
 *  root's slots) at `index`; an omitted index appends. */
export function insertAt(
  content: Record<string, EditorNode[]>,
  parentPath: Step[],
  slot: string,
  child: EditorNode,
  index?: number
): Record<string, EditorNode[]> {
  if (parentPath.length === 0) {
    const list = content[slot] ?? [];
    const at = index ?? list.length;
    return {
      ...content,
      [slot]: [...list.slice(0, at), child, ...list.slice(at)],
    };
  }
  const [step, ...rest] = parentPath;
  const list = content[step.slot] ?? [];
  const nextList = list.map((node, position) =>
    position === step.index && isContainer(node)
      ? { ...node, slots: insertAt(node.slots, rest, slot, child, index) }
      : node
  );
  return { ...content, [step.slot]: nextList };
}

/** Remove the node at `path` (path must be non-empty). */
export function removeAt(
  content: Record<string, EditorNode[]>,
  path: Step[]
): Record<string, EditorNode[]> {
  const [step, ...rest] = path;
  const list = content[step.slot] ?? [];
  if (rest.length === 0)
    return {
      ...content,
      [step.slot]: list.filter((_, index) => index !== step.index),
    };
  const nextList = list.map((node, index) =>
    index === step.index && isContainer(node)
      ? { ...node, slots: removeAt(node.slots, rest) }
      : node
  );
  return { ...content, [step.slot]: nextList };
}

/** The node at `path`, or null when nothing is there. The root is the tree
 *  itself rather than a node of its content, so the empty path gives null. */
export function nodeAt(
  content: Record<string, EditorNode[]>,
  path: Step[]
): EditorNode | null {
  let slots = content;
  let node: EditorNode | null = null;
  for (const step of path) {
    node = (slots[step.slot] ?? [])[step.index] ?? null;
    if (!node) return null;
    slots = isContainer(node) ? node.slots : {};
  }
  return node;
}

/**
 * The path of a child: the node at `index` in `slot` of the node at `parent`.
 *
 * @param parent - The parent's path; `[]` for the root.
 * @param slot - The slot the child is in.
 * @param index - The child's index in the slot.
 * @returns The child's path.
 */
export function childPath(
  parent: NodePath,
  slot: string,
  index: number
): NodePath {
  return [...parent, { slot, index }];
}

/**
 * A string that identifies a path, for a key or a lookup: `'root'` for the
 * root, otherwise each step's slot and index.
 *
 * @param path - The path.
 * @returns The key, such as `'default:0/header:1'`.
 */
export function pathKey(path: NodePath): string {
  return path.length === 0
    ? 'root'
    : path.map((step) => `${step.slot}:${step.index}`).join('/');
}

/** True if `candidate` addresses `path` itself or one of its ancestors
 *  (`candidate` is a prefix of `path`). Used to forbid dropping a node into its
 *  own subtree. */
function isAncestorOrSelf(candidate: Step[], path: Step[]): boolean {
  if (candidate.length > path.length) return false;
  return candidate.every(
    (step, position) =>
      step.slot === path[position].slot && step.index === path[position].index
  );
}

/** Removing the node at `from` shifts the indices of its later siblings, so a
 *  target parent path that runs through one of them shifts down by one. */
function adjustForRemoval(target: Step[], from: Step[]): Step[] {
  const fromParent = from.slice(0, -1);
  const fromStep = from[from.length - 1];
  if (target.length <= fromParent.length) return target;
  for (let k = 0; k < fromParent.length; k++) {
    if (
      target[k].slot !== fromParent[k].slot ||
      target[k].index !== fromParent[k].index
    )
      return target;
  }
  const divergence = target[fromParent.length];
  if (divergence.slot === fromStep.slot && divergence.index > fromStep.index) {
    const next = [...target];
    next[fromParent.length] = { ...divergence, index: divergence.index - 1 };
    return next;
  }
  return target;
}

/** Move the node at `from` to `target`: remove it, then insert it, adjusting the
 *  target for the index shift the removal causes in a shared sibling list. The
 *  root, a missing node, and a drop into the node's own subtree leave the
 *  content unchanged (the same object back). */
export function moveNode(
  content: Record<string, EditorNode[]>,
  from: Step[],
  target: DropTarget
): Record<string, EditorNode[]> {
  if (from.length === 0) return content;
  if (isAncestorOrSelf(from, target.parent)) return content;
  const node = nodeAt(content, from);
  if (!node) return content;
  const fromParent = from.slice(0, -1);
  const fromStep = from[from.length - 1];
  const sameList =
    pathKey(fromParent) === pathKey(target.parent) &&
    fromStep.slot === target.slot;
  const index =
    sameList && fromStep.index < target.index ? target.index - 1 : target.index;
  const removed = removeAt(content, from);
  return insertAt(
    removed,
    adjustForRemoval(target.parent, from),
    target.slot,
    node,
    index
  );
}

/** A sortable list's address: the parent whose slot it lists, and the slot. */
export interface SortableListAddress {
  parent: Step[];
  slot: string;
}

/** Translate a sortable move (where the node ends up in its list) into the path
 *  it leaves and the drop target `moveNode` takes (the index it goes before,
 *  counted before the removal). */
export function resolveSortableMove(
  source: SortableListAddress,
  target: SortableListAddress,
  sameList: boolean,
  fromIndex: number,
  toIndex: number
): { from: Step[]; target: DropTarget } {
  return {
    from: childPath(source.parent, source.slot, fromIndex),
    target: {
      parent: target.parent,
      slot: target.slot,
      index: sameList && toIndex > fromIndex ? toIndex + 1 : toIndex,
    },
  };
}

// --- seeding ----------------------------------------------------------------

/** What the editor reads of a manifest component to seed a node from it. */
export interface SeedableComponent {
  name: string;
  defaultProps: Record<string, Json>;
  content?: SlotPlan;
}

/** A component swapped in under an existing node: its default props, with a
 *  string `children` default as a default-slot text child (children is the
 *  default slot, not a prop). */
export function seedNode(component: SeedableComponent): EditorNode {
  const props = { ...component.defaultProps };
  const slots: Record<string, EditorNode[]> = {};
  if (typeof props.children === 'string')
    slots[DEFAULT_SLOT] = [{ kind: 'text', value: props.children }];
  delete props.children;
  return { kind: 'element', component: component.name, props, slots };
}

/** A component added through the add dialog. With `props` the node carries them
 *  plus the component's curated slot content (the default or a named scenario);
 *  without, it comes in empty - no props, no content. */
export function seedComponentNode(
  component: SeedableComponent,
  props?: Record<string, Json>
): EditorNode {
  if (!props)
    return { kind: 'element', component: component.name, props: {}, slots: {} };
  const nodeProps = { ...props };
  const slots = seedSlots(component.content, nodeProps);
  delete nodeProps.children;
  return {
    kind: 'element',
    component: component.name,
    props: nodeProps,
    slots,
  };
}

/** The root seeded from its story file content, so the tree starts from what the
 *  browse view renders, with `props` (a story's scenario-merged props) or the
 *  component's defaults. */
export function seedRoot(
  component: SeedableComponent,
  props?: Record<string, Json>
): EditorState {
  const rootProps = { ...(props ?? component.defaultProps) };
  const slots = seedSlots(component.content, rootProps);
  delete rootProps.children;
  return { root: component.name, props: rootProps, slots };
}

/**
 * A key for a tree's slot content, equal for two trees of the same content
 * whatever their node ids or the order of their props' keys: what the
 * regeneration payload would carry, serialized with sorted keys.
 */
export function slotsKey(slots: Record<string, EditorNode[]>): string {
  return stableStringify(
    toPayload({ root: '', props: {}, slots }).slots as unknown
  );
}

/** A value as JSON with every object's keys sorted, so two values equal by
 *  content serialize the same; `undefined` entries are left out. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// --- serialization to the regeneration payload -------------------------------------

/**
 * The props as JSON, each one left unset (`undefined`) left out. An empty
 * string is a value like any other and stays, so a component given `''`
 * keeps it on every update; a story unsets a prop with `null`.
 *
 * @param record - The props, from the controls or a pane's write-back.
 * @returns The props that are set.
 */
export function cleanRecord(
  record: Record<string, Json>
): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(record))
    if (value !== undefined) out[key] = value as JsonValue;
  return out;
}

function listToFill(nodes: EditorNode[]): SlotFill | undefined {
  const fills = nodes.map(nodeToFill);
  if (fills.length === 0) return undefined;
  if (fills.length === 1) return fills[0];
  return { kind: 'fragment', children: fills };
}

export function namedFills(
  slots: Record<string, EditorNode[]>
): Record<string, SlotFill> {
  const out: Record<string, SlotFill> = {};
  for (const [name, nodes] of Object.entries(slots)) {
    if (name === DEFAULT_SLOT) continue;
    const fill = listToFill(nodes);
    if (fill) out[name] = fill;
  }
  return out;
}

function nodeToFill(node: EditorNode): SlotFill {
  if (node.kind === 'text') return { kind: 'text', value: node.value };
  if (node.kind === 'opaque') return node.fill;
  const children = listToFill(node.slots[DEFAULT_SLOT] ?? []);
  if (node.kind === 'html') {
    return {
      kind: 'html',
      tag: node.tag,
      props: cleanRecord(node.props),
      ...(children ? { children } : {}),
    };
  }
  const named = namedFills(node.slots);
  return {
    kind: 'element',
    component: node.component,
    props: cleanRecord(node.props),
    ...(children ? { children } : {}),
    ...(Object.keys(named).length ? { slots: named } : {}),
  };
}

// --- seeding from story file content (SlotFill → EditorNode) --------------------

// Inverse of nodeToFill: turn a story file's SlotFill into the editor's node list so
// a per-story tree starts from the curated content the browse view renders. A
// `fragment` flattens into its siblings; a `raw` or `scoped` fill or a call to
// a part becomes one opaque node that keeps the fill as authored.
export function fillToNodes(fill: SlotFill | undefined): EditorNode[] {
  if (!fill) return [];
  if (fill.kind === 'text') return [{ kind: 'text', value: fill.value }];
  if (fill.kind === 'fragment') return fill.children.flatMap(fillToNodes);
  if (fill.kind === 'raw' || fill.kind === 'scoped' || fill.kind === 'part')
    return [{ kind: 'opaque', fill }];
  const slots: Record<string, EditorNode[]> = {};
  const def = fillToNodes(fill.children);
  if (def.length) slots[DEFAULT_SLOT] = def;
  if (fill.kind === 'html') {
    return [
      { kind: 'html', tag: fill.tag, props: { ...(fill.props ?? {}) }, slots },
    ];
  }
  for (const [name, named] of Object.entries(fill.slots ?? {})) {
    const nodes = fillToNodes(named);
    if (nodes.length) slots[name] = nodes;
  }
  return [
    {
      kind: 'element',
      component: fill.component,
      props: { ...(fill.props ?? {}) },
      slots,
    },
  ];
}

/** Seed a root component's slot content from its story file SlotPlan, falling back to
 *  a default-slot text child when a string `children` prop is the only content. */
export function seedSlots(
  content: SlotPlan | undefined,
  props: Record<string, Json>
): Record<string, EditorNode[]> {
  if (content) {
    const slots: Record<string, EditorNode[]> = {};
    const def = fillToNodes(content.default);
    if (def.length) slots[DEFAULT_SLOT] = def;
    for (const [name, fill] of Object.entries(content.named ?? {})) {
      const nodes = fillToNodes(fill);
      if (nodes.length) slots[name] = nodes;
    }
    return slots;
  }
  if (typeof props.children === 'string')
    return { [DEFAULT_SLOT]: [{ kind: 'text', value: props.children }] };
  return {};
}

/** The regeneration payload for a root component, its props and its slot
 *  content. */
export function toPayload(state: EditorState) {
  const def = listToFill(state.slots[DEFAULT_SLOT] ?? []);
  const named = namedFills(state.slots);
  const hasContent = def || Object.keys(named).length > 0;
  return {
    rootComponent: state.root,
    props: cleanRecord(state.props),
    slots: hasContent
      ? {
          ...(def ? { default: def } : {}),
          ...(Object.keys(named).length ? { named } : {}),
        }
      : undefined,
  };
}
