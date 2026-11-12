// The scene editor seeds its tree from a story file's slot plan and serializes it
// back on every structural edit. A `raw` or `scoped` fill is per-target source
// the editor cannot author: it becomes one locked node and must round-trip
// verbatim, with its declared imports reaching the scratch registry. Edits go
// through immutable path operations; a move removes the node and inserts it at
// a target counted before the removal, so the index shifts it causes are the
// operations' to correct, not the caller's.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  childPath,
  insertAt,
  moveNode,
  nodeAt,
  pathKey,
  removeAt,
  resolveSortableMove,
  seedComponentNode,
  seedNode,
  seedRoot,
  ensureIds,
  seedSlots,
  toPayload,
  updateAt,
  type EditorNode,
} from '../src/controller/editor-tree';
import { writeScratch } from '../src/emit/scratch';
import type { SlotFill, SlotPlan } from '../src/lib/types';

const scoped: SlotFill = {
  kind: 'scoped',
  slot: { react: 'renderTrigger', vue: 'trigger', svelte: 'trigger' },
  parameters: ['props'],
  react: '<Button {...props} label="Open" />',
  vue: '<Button v-bind="props" label="Open" />',
  svelte: '<Button {...props} label="Open" />',
  imports: ['Button'],
};

const raw: SlotFill = {
  kind: 'raw',
  react: '<RichText value="**bold**" />',
  vue: '<RichText value="**bold**" />',
  svelte: '<RichText value="**bold**" />',
  imports: ['RichText'],
};

const plan: SlotPlan = {
  default: {
    kind: 'fragment',
    children: [raw, { kind: 'element', component: 'Badge', props: { label: 'New' } }],
  },
  named: { trigger: scoped },
};

describe('editor tree', () => {
  it('seeds raw and scoped fills as locked nodes', () => {
    const slots = seedSlots(plan, {});
    expect(slots.default.map((node) => node.kind)).toEqual(['opaque', 'element']);
    expect(slots.trigger).toEqual([{ kind: 'opaque', fill: scoped }]);
  });

  it('round-trips raw and scoped fills verbatim', () => {
    const slots = seedSlots(plan, {});
    ensureIds(slots);
    const payload = toPayload({ root: 'Popout', props: {}, slots });
    expect(payload.slots).toEqual(plan);
  });

  it('keeps a locked node verbatim when it moves between slots', () => {
    const slots = seedSlots(plan, {});
    const moved = { default: slots.default.slice(1), trigger: [...slots.trigger, slots.default[0]] };
    const payload = toPayload({ root: 'Popout', props: {}, slots: moved });
    expect(payload.slots?.named?.trigger).toEqual({ kind: 'fragment', children: [scoped, raw] });
  });
});

const text = (value: string): EditorNode => ({ kind: 'text', value });
const html = (tag: string, children: EditorNode[] = []): EditorNode => ({
  kind: 'html',
  tag,
  props: {},
  slots: children.length ? { default: children } : {},
});

/** The tree as nested labels: a text's value, an html node's tag and children. */
function outline(
  slots: Record<string, EditorNode[]>
): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const [slot, nodes] of Object.entries(slots)) {
    out[slot] = nodes.map((node) =>
      node.kind === 'text'
        ? node.value
        : node.kind === 'html'
          ? { [node.tag]: outline(node.slots) }
          : node.kind
    );
  }
  return out;
}

// default: [a, section[b, c], d]; footer: [e]
const tree = (): Record<string, EditorNode[]> => ({
  default: [text('a'), html('section', [text('b'), text('c')]), text('d')],
  footer: [text('e')],
});

describe('editor tree operations', () => {
  it('addresses the root with the empty path, and a child by slot and index', () => {
    const before = tree();
    const section = childPath([], 'default', 1);
    expect(section).toEqual([{ slot: 'default', index: 1 }]);
    expect(childPath(section, 'default', 0)).toEqual([
      { slot: 'default', index: 1 },
      { slot: 'default', index: 0 },
    ]);
    expect(pathKey([])).toBe('root');
    expect(pathKey(childPath(section, 'default', 0))).toBe('default:1/default:0');
    // The root is the tree itself, not a node of its content.
    expect(nodeAt(before, [])).toBeNull();
    expect(outline(insertAt(before, [], 'footer', text('f'))).footer).toEqual([
      'e',
      'f',
    ]);
  });

  it('reads, updates, inserts and removes by path without touching the input', () => {
    const before = tree();
    const snapshot = JSON.stringify(before);
    const path = [
      { slot: 'default', index: 1 },
      { slot: 'default', index: 0 },
    ];
    expect(nodeAt(before, path)).toEqual(text('b'));
    expect(nodeAt(before, [{ slot: 'default', index: 9 }])).toBeNull();
    expect(
      nodeAt(before, [
        { slot: 'default', index: 0 },
        { slot: 'default', index: 0 },
      ])
    ).toBeNull();

    const updated = updateAt(before, path, () => text('B'));
    expect(outline(updated).default[1]).toEqual({
      section: { default: ['B', 'c'] },
    });

    const inserted = insertAt(
      before,
      [{ slot: 'default', index: 1 }],
      'default',
      text('x'),
      1
    );
    expect(outline(inserted).default[1]).toEqual({
      section: { default: ['b', 'x', 'c'] },
    });
    const appended = insertAt(before, [], 'aside', text('y'));
    expect(outline(appended).aside).toEqual(['y']);

    const removed = removeAt(before, path);
    expect(outline(removed).default[1]).toEqual({
      section: { default: ['c'] },
    });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('moves a node later within its own list, landing before the target index', () => {
    // a before index 3 (counted before removal): between d and the end of the list.
    const moved = moveNode(tree(), [{ slot: 'default', index: 0 }], {
      parent: [],
      slot: 'default',
      index: 3,
    });
    expect(outline(moved).default).toEqual([
      { section: { default: ['b', 'c'] } },
      'd',
      'a',
    ]);
  });

  it('moves a node earlier within its own list', () => {
    const moved = moveNode(tree(), [{ slot: 'default', index: 2 }], {
      parent: [],
      slot: 'default',
      index: 0,
    });
    expect(outline(moved).default).toEqual([
      'd',
      'a',
      { section: { default: ['b', 'c'] } },
    ]);
  });

  it('moves a node between slots', () => {
    const moved = moveNode(tree(), [{ slot: 'footer', index: 0 }], {
      parent: [],
      slot: 'default',
      index: 1,
    });
    expect(outline(moved)).toEqual({
      default: ['a', 'e', { section: { default: ['b', 'c'] } }, 'd'],
      footer: [],
    });
  });

  it('corrects a target that runs through a later sibling of the moved node', () => {
    // a leaves default:0, so the section at default:1 becomes default:0.
    const moved = moveNode(tree(), [{ slot: 'default', index: 0 }], {
      parent: [{ slot: 'default', index: 1 }],
      slot: 'default',
      index: 1,
    });
    expect(outline(moved).default).toEqual([
      { section: { default: ['b', 'a', 'c'] } },
      'd',
    ]);
  });

  it('moves a nested node out to the root', () => {
    const moved = moveNode(
      tree(),
      [
        { slot: 'default', index: 1 },
        { slot: 'default', index: 1 },
      ],
      {
        parent: [],
        slot: 'footer',
        index: 0,
      }
    );
    expect(outline(moved)).toEqual({
      default: ['a', { section: { default: ['b'] } }, 'd'],
      footer: ['c', 'e'],
    });
  });

  it('leaves the tree untouched for the root, a missing node, or a drop into the node itself', () => {
    const before = tree();
    expect(
      moveNode(before, [], { parent: [], slot: 'default', index: 0 })
    ).toBe(before);
    expect(
      moveNode(before, [{ slot: 'default', index: 7 }], {
        parent: [],
        slot: 'default',
        index: 0,
      })
    ).toBe(before);
    const intoItself = {
      parent: [{ slot: 'default', index: 1 }],
      slot: 'default',
      index: 0,
    };
    expect(moveNode(before, [{ slot: 'default', index: 1 }], intoItself)).toBe(
      before
    );
  });

  it('turns a sortable move into the index the node goes before', () => {
    const list = { parent: [], slot: 'default' };
    const other = { parent: [{ slot: 'default', index: 1 }], slot: 'default' };
    // Within one list the group reports the final index; moving down lands before the next one.
    expect(resolveSortableMove(list, list, true, 0, 2)).toEqual({
      from: [{ slot: 'default', index: 0 }],
      target: { parent: [], slot: 'default', index: 3 },
    });
    expect(resolveSortableMove(list, list, true, 2, 0).target.index).toBe(0);
    // Across lists the reported index is already the insertion point.
    expect(resolveSortableMove(list, other, false, 0, 2).target).toEqual({
      parent: other.parent,
      slot: 'default',
      index: 2,
    });
    // Round trip: a sortable move to the end of its list puts the node last.
    const { from, target } = resolveSortableMove(list, list, true, 0, 2);
    expect(outline(moveNode(tree(), from, target)).default.at(-1)).toBe('a');
  });
});

describe('editor seeding', () => {
  const component = {
    name: 'Card',
    defaultProps: { tone: 'plain', children: 'Hello' },
    content: { default: { kind: 'text', value: 'Curated' } } satisfies SlotPlan,
  };

  it('swaps a component in at its defaults, with a string children default as text', () => {
    expect(seedNode({ ...component, content: undefined })).toEqual({
      kind: 'element',
      component: 'Card',
      props: { tone: 'plain' },
      slots: { default: [text('Hello')] },
    });
  });

  it('adds a component empty, or at the given props with its curated content', () => {
    expect(seedComponentNode(component)).toEqual({
      kind: 'element',
      component: 'Card',
      props: {},
      slots: {},
    });
    expect(
      seedComponentNode(component, { tone: 'loud', children: 'ignored' })
    ).toEqual({
      kind: 'element',
      component: 'Card',
      props: { tone: 'loud' },
      slots: { default: [text('Curated')] },
    });
  });

  it('seeds the root from the given props, else the defaults', () => {
    expect(seedRoot(component).props).toEqual({ tone: 'plain' });
    expect(seedRoot(component, { tone: 'loud' })).toEqual({
      root: 'Card',
      props: { tone: 'loud' },
      slots: { default: [text('Curated')] },
    });
  });
});

describe('scratch registry', () => {
  let generatedRoot: string | undefined;
  afterEach(() => {
    if (generatedRoot) rmSync(generatedRoot, { recursive: true, force: true });
  });

  it('imports the components raw and scoped fills declare', () => {
    generatedRoot = mkdtempSync(join(tmpdir(), 'preview-scratch-'));
    writeFileSync(
      join(generatedRoot, 'modules.json'),
      JSON.stringify({ defaultModule: 'kit', moduleByName: {}, importOverrideByName: {}, exportByName: {} }),
    );
    writeScratch(toPayload({ root: 'Popout', props: {}, slots: seedSlots(plan, {}) }), generatedRoot);
    const react = readFileSync(join(generatedRoot, 'scratch', 'react.tsx'), 'utf8');
    for (const name of ['Button', 'RichText', 'Badge']) expect(react).toMatch(new RegExp(`\\b${name}\\b.*from 'kit/react'`));
  });
});
