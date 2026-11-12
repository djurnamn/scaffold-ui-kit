// Slot fills a test writes once and every target renders the same way.

/** The props a component renders with: plain values, and slot fills made by
 *  {@link slot} and {@link scopedSlot}. */
export type RenderProps = Record<string, unknown>;

/** The class every slot fill's element carries, so a fill is easy to find in
 *  rendered markup. */
export const SLOT_FILL_CLASS = 'SlotFill';

// What tells a fill from a prop that merely looks like one. Registered
// symbols, so a fill still counts when a test runner loads this module twice.
const SLOT_FILL_BRAND = Symbol.for('@scaffold-ui-kit/testing/slot-fill');
const SCOPED_SLOT_FILL_BRAND = Symbol.for(
  '@scaffold-ui-kit/testing/scoped-slot-fill'
);

/** Content for a slot, made by {@link slot}; an object of the same fields is
 *  not one. */
export interface SlotFill {
  readonly [SLOT_FILL_BRAND]: true;
  /** The text the fill renders. */
  readonly slotFillText: string;
}

/** Content for a scoped slot, made by {@link scopedSlot}; an object of the
 *  same fields is not one. */
export interface ScopedSlotFill {
  readonly [SCOPED_SLOT_FILL_BRAND]: true;
  /** The key of the scope whose record the fill spreads onto its element. */
  readonly scopedSlotBinding: string;
  /** The text the fill renders. */
  readonly scopedSlotText: string;
}

/**
 * Content for a slot prop, rendered in every target as one element,
 * `<em class="SlotFill">text</em>`: a React node, a Vue slot or a Svelte
 * snippet. The default slot is the `children` prop in every target; Vue
 * receives it as its `default` slot.
 *
 * @param text - The text the fill renders.
 * @returns The fill, to pass as a prop's value.
 * @example
 * ```ts
 * await renderer.render('vue', 'Button', { children: slot('Save') });
 * // <button class="Button"><em class="SlotFill">Save</em></button>
 * ```
 */
export function slot(text: string): SlotFill {
  return { [SLOT_FILL_BRAND]: true, slotFillText: text };
}

/**
 * Content for a scoped slot: the fill takes the record the component hands
 * its scope under `binding`, spreads it onto a `<button class="SlotFill">`
 * and renders `text` inside. React calls the prop as a function of the
 * scope, Vue passes the scope to its slot, Svelte to its snippet. The
 * record's `key` and `ref` are left out in every target. The render throws,
 * listing the scope's keys, when the scope has no such binding or its value
 * is not a record.
 *
 * @param binding - The key of the scope to spread, such as `triggerProps`.
 * @param text - The text the fill renders.
 * @returns The fill, to pass as a prop's value.
 * @example
 * ```ts
 * await renderer.render('svelte', 'Popover', { trigger: scopedSlot('triggerProps', 'Open') });
 * ```
 */
export function scopedSlot(binding: string, text: string): ScopedSlotFill {
  return {
    [SCOPED_SLOT_FILL_BRAND]: true,
    scopedSlotBinding: binding,
    scopedSlotText: text,
  };
}

/** Whether a prop's value is a {@link slot} fill. */
export function isSlotFill(value: unknown): value is SlotFill {
  return (
    typeof value === 'object' && value !== null && SLOT_FILL_BRAND in value
  );
}

/** Whether a prop's value is a {@link scopedSlot} fill. */
export function isScopedSlotFill(value: unknown): value is ScopedSlotFill {
  return (
    typeof value === 'object' &&
    value !== null &&
    SCOPED_SLOT_FILL_BRAND in value
  );
}

/** Props split into plain values, slot fills and scoped slot fills. */
export interface PartitionedProps {
  plain: RenderProps;
  slots: Record<string, SlotFill>;
  scopedSlots: Record<string, ScopedSlotFill>;
}

/**
 * Split props into plain values, slot fills and scoped slot fills.
 *
 * @param props - The props to split.
 * @returns The three groups, each keyed by prop name.
 */
export function partitionProps(props: RenderProps): PartitionedProps {
  const plain: RenderProps = {};
  const slots: Record<string, SlotFill> = {};
  const scopedSlots: Record<string, ScopedSlotFill> = {};
  for (const [name, value] of Object.entries(props)) {
    if (isScopedSlotFill(value)) scopedSlots[name] = value;
    else if (isSlotFill(value)) slots[name] = value;
    else plain[name] = value;
  }
  return { plain, slots, scopedSlots };
}

/** Whether a value is a record of attributes to spread. */
function isRecord(value: unknown): value is RenderProps {
  return Object.prototype.toString.call(value) === '[object Object]';
}

/** A value named by its kind, for an error message. */
function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object') return 'an object that is not a record';
  return `a ${typeof value}`;
}

/** The sentence an error ends on: what the scope does hold. */
function describeKeys(scope: unknown): string {
  const keys = isRecord(scope) ? Object.keys(scope) : [];
  return keys.length > 0
    ? `The scope's keys are ${keys.join(', ')}.`
    : 'The scope has no keys.';
}

/**
 * The attributes a {@link scopedSlot} fill spreads onto its button, in every
 * target: the record under the fill's binding, without `key` and `ref`, which
 * React and Vue take for themselves and Svelte would write as attributes.
 *
 * @param fill - The fill.
 * @param scope - What the component handed the slot.
 * @returns The attributes to spread.
 * @throws When the scope has no such binding, or its value is not a record.
 */
export function scopedFillAttributes(
  fill: ScopedSlotFill,
  scope: unknown
): RenderProps {
  const binding = fill.scopedSlotBinding;
  if (!isRecord(scope) || !(binding in scope)) {
    throw new Error(
      `scopedSlot('${binding}') names a binding the slot's scope does not have. ${describeKeys(scope)}`
    );
  }
  const value = scope[binding];
  if (!isRecord(value)) {
    throw new Error(
      `scopedSlot('${binding}') spreads a record onto its button, and the scope's ${binding} is ${describeValue(value)}. ${describeKeys(scope)}`
    );
  }
  const attributes = { ...value };
  delete attributes.key;
  delete attributes.ref;
  return attributes;
}

/** The markup a {@link slot} fill renders, written by hand where a target
 *  takes raw markup (a Svelte raw snippet). */
export function slotFillMarkup(text: string): string {
  return `<em class="${SLOT_FILL_CLASS}">${escapeText(text)}</em>`;
}

/** Escape text for an HTML text node. */
function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
