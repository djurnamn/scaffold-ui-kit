// Component references in a slot fill tree, collected so a generated registry
// imports them. Kept dependency-free in lib/ so both the generator (model.ts)
// and the dev middleware's scratch regeneration (emit/scratch.ts) share it without the
// middleware pulling in the generation-time story file graph.

import type { PartFill, SlotFill } from './types.js';

const SLOT_FILL_KINDS = new Set<SlotFill['kind']>([
  'text',
  'element',
  'html',
  'fragment',
  'raw',
  'scoped',
  'part',
]);

/** Adds every component name a fill tree references to `into`: each `element`'s
 *  component, and the declared `imports` of an opaque `raw` or `scoped` body
 *  or a part's, unless `parts` is false. */
export function collectSlotComponents(
  fill: SlotFill | undefined,
  into: Set<string>,
  parts = true
): void {
  if (!fill) return;
  // Fail loudly on a malformed fill rather than letting it flow downstream, where
  // an emitter silently generates `<undefined>`. The most common slip is an array
  // where a single SlotFill is expected - multiple children need a fragment.
  if (
    typeof fill !== 'object' ||
    Array.isArray(fill) ||
    !SLOT_FILL_KINDS.has((fill as SlotFill).kind)
  ) {
    throw new Error(
      `Invalid slot fill: expected a SlotFill object with a known "kind", got ${
        Array.isArray(fill)
          ? 'an array - wrap multiple children in { kind: "fragment", children: [...] }'
          : JSON.stringify(fill)
      }.`
    );
  }
  if (fill.kind === 'element') {
    into.add(fill.component);
    for (const slotFill of Object.values(fill.slots ?? {}))
      collectSlotComponents(slotFill, into, parts);
    collectSlotComponents(fill.children, into, parts);
  } else if (fill.kind === 'html') {
    collectSlotComponents(fill.children, into, parts);
  } else if (fill.kind === 'fragment') {
    for (const child of fill.children)
      collectSlotComponents(child, into, parts);
  } else if (
    fill.kind === 'raw' ||
    fill.kind === 'scoped' ||
    (fill.kind === 'part' && parts)
  ) {
    // A raw/scoped/part body is opaque, so it declares its component references explicitly.
    for (const name of fill.imports ?? []) into.add(name);
  }
}

/**
 * The parts a story's slot content calls, by name, in the order first called.
 * A part is called in the content's tree; a call inside a body is the body's
 * own markup and declares nothing.
 *
 * @param fills - The story's slot fills: its default slot and named slots.
 * @returns Each part's call, carrying its declaration.
 * @throws When two calls of one name declare different parts.
 */
export function collectParts(
  fills: Iterable<SlotFill | undefined>
): Map<string, PartFill> {
  const parts = new Map<string, PartFill>();
  const visit = (fill: SlotFill | undefined): void => {
    if (!fill) return;
    if (fill.kind === 'element') {
      for (const slotFill of Object.values(fill.slots ?? {})) visit(slotFill);
      visit(fill.children);
    } else if (fill.kind === 'html') {
      visit(fill.children);
    } else if (fill.kind === 'fragment') {
      fill.children.forEach(visit);
    } else if (fill.kind === 'part') {
      const known = parts.get(fill.name);
      if (!known) parts.set(fill.name, fill);
      else if (declarationOf(known) !== declarationOf(fill))
        throw new Error(
          `Two calls of the part ${fill.name} declare it differently; every call carries the same declaration.`
        );
    }
  };
  for (const fill of fills) visit(fill);
  return parts;
}

/** A part's declaration, without the props one call passes, as a key. */
function declarationOf(part: PartFill): string {
  const { props: _props, ...declaration } = part;
  return JSON.stringify(declaration);
}
