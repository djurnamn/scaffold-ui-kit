// A keyboard walk over a mounted story: Tab reaches each tabbable element in
// document order and Shift+Tab walks back. An open modal is walked around
// instead, and a composite widget is checked for its one tab stop. The
// functions handed to `evaluate` run in the browser, so they read only their
// argument and browser globals.

import {
  PREVIEW_MOUNT_ELEMENT_ID,
  readRenderError,
  type PreviewPage,
} from '@scaffold-ui-kit/preview/testing';

/** A page that takes key presses as well; a Playwright `Page` is one. */
export interface KeyboardPage extends PreviewPage {
  /** The page's keyboard. */
  keyboard: {
    /** Press a key or a chord, such as `Tab` or `Shift+Tab`. */
    press(key: string): Promise<void>;
  };
}

/** What {@link walkKeyboard} found. */
export interface KeyboardWalk {
  /** What was walked: the `mount`, or the `modal` open on the page, which
   *  keeps focus inside it. */
  scope: 'mount' | 'modal';
  /** The tabbable elements in the scope, in document order, each described
   *  as `tag#id`, or by its tag and first three classes when it has no id. */
  expected: string[];
  /** The elements Tab reached, in order, until it left the mount; in a modal,
   *  from the first it reached until it came around to that one again. */
  forward: string[];
  /** The elements Shift+Tab reached from the end, in order, until it left the
   *  mount; in a modal, until it came around again. */
  backward: string[];
  /** What went wrong, one line each; empty when the walk held. */
  failures: string[];
}

/** The attribute that numbers the tabbable elements during a walk. */
const WALK_ATTRIBUTE = 'data-keyboard-walk';
/** The attribute that marks the stops placed before and after the mount. */
const SENTINEL_ATTRIBUTE = 'data-keyboard-walk-sentinel';
/** The attribute that marks the modal a walk goes around. */
const SCOPE_ATTRIBUTE = 'data-keyboard-walk-scope';

/** How many presses in a row may leave focus on the modal itself or on the
 *  body as Tab comes around a modal: a native dialog passes through the
 *  browser's own controls on the way. */
const MOST_PRESSES_BETWEEN_ENDS = 2;

/** How many repeat presses Tab may spend inside an input it moves through
 *  by segment before the walk reports focus stuck there: a `datetime-local`
 *  input takes five. */
const MOST_PRESSES_INSIDE_A_STOP = 8;

/** Where {@link walkKeyboard} walks. */
export interface WalkKeyboardOptions {
  /** The id of the element whose tabbable elements to walk:
   *  {@link PREVIEW_MOUNT_ELEMENT_ID} by default. */
  mountId?: string;
}

/**
 * Number the tabbable elements in the mount and place a tab stop before and
 * after it. When a modal is open (a native dialog opened with `showModal()`,
 * or a shown element with `aria-modal="true"`), the modal is the scope
 * instead, wherever in the document it sits: its tabbable elements are
 * numbered, no stop is placed and focus is left where the modal put it. Of
 * several open modals the one holding focus is taken, or the last in the
 * document. Runs in the browser. An element is tabbable when it is focusable,
 * enabled, shown, outside an inert subtree and has no negative tabindex; of a
 * group of radio buttons only the checked one is, or the first when none is.
 * A contenteditable editing host is tabbable without a tabindex, though
 * Chromium reports its `tabIndex` as -1; what is inside one, a link or an
 * editable element, is part of it and no stop of its own, since Tab leaves
 * the host. The content of a `contenteditable="false"` island inside a host
 * is tabbable again. A region that scrolls and holds no keyboard-focusable
 * element is tabbable too, as Chromium makes it a tab stop so its content can
 * be reached; a scrolling region inside it takes that stop instead. Also
 * returns the numbers of the inputs Tab moves through by segment, and one
 * line for each composite widget in the scope that is not a single tab stop:
 * a `listbox`, `grid`, `tree`, `tablist`, `menu` or `radiogroup` whose items
 * all take Tab, or none of whose items does while nothing else stands in
 * for them. An item takes Tab when it or an element inside it is tabbable;
 * items that are disabled or not shown are left out, and so is a native radio
 * button, which the browser groups itself. A widget with no tabbable item
 * passes when it is tabbable itself, names its active item with
 * `aria-activedescendant`, holds focus, or is named by another element's
 * `aria-controls`, `aria-owns` or `aria-activedescendant`, as a popup's
 * trigger or a combobox's input does.
 */
function prepareWalk(argument: {
  mountId: string;
  walkAttribute: string;
  sentinelAttribute: string;
  scopeAttribute: string;
}): {
  scope: 'mount' | 'modal';
  stops: string[];
  segmented: string[];
  composites: string[];
} {
  const mount = document.getElementById(argument.mountId);
  if (!mount) throw new Error(`No element has the id ${argument.mountId}.`);
  const selector = [
    'a[href]',
    'area[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'iframe',
    'audio[controls]',
    'video[controls]',
    'summary',
    '[contenteditable]:not([contenteditable="false"])',
    '[tabindex]',
  ].join(',');
  const shown = (element: HTMLElement) =>
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden';
  const modals = [
    ...document.querySelectorAll<HTMLElement>('dialog, [aria-modal="true"]'),
  ].filter((element) =>
    element instanceof HTMLDialogElement &&
    element.getAttribute('aria-modal') !== 'true'
      ? element.matches(':modal')
      : shown(element) && !element.closest('[inert]')
  );
  const modal =
    [...modals]
      .reverse()
      .find((element) => element.contains(document.activeElement)) ??
    modals.at(-1);
  const root = modal ?? mount;
  const isEditingHost = (element: HTMLElement) =>
    element.isContentEditable &&
    element.parentElement?.isContentEditable !== true &&
    !element.hasAttribute('tabindex');
  const candidates = [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (element) =>
      (element.tabIndex >= 0 || isEditingHost(element)) &&
      element.parentElement?.isContentEditable !== true &&
      !(element as HTMLButtonElement).disabled &&
      !element.closest('[inert]') &&
      !element.closest('fieldset[disabled]') &&
      shown(element)
  );
  const radioGroups = new Map<string, HTMLInputElement[]>();
  for (const element of candidates) {
    if (
      element instanceof HTMLInputElement &&
      element.type === 'radio' &&
      element.name
    ) {
      const key = `${element.form?.id ?? ''}\u0000${element.name}`;
      radioGroups.set(key, [...(radioGroups.get(key) ?? []), element]);
    }
  }
  const tabbable = candidates.filter((element) => {
    if (
      !(element instanceof HTMLInputElement) ||
      element.type !== 'radio' ||
      !element.name
    ) {
      return true;
    }
    const group =
      radioGroups.get(`${element.form?.id ?? ''}\u0000${element.name}`) ?? [];
    const checked = group.find((radio) => radio.checked);
    return element === (checked ?? group[0]);
  });
  const scrolls = (overflow: string, visible: number, content: number) =>
    (overflow === 'auto' || overflow === 'scroll') && content > visible;
  const isScroller = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    return (
      scrolls(style.overflowX, element.clientWidth, element.scrollWidth) ||
      scrolls(style.overflowY, element.clientHeight, element.scrollHeight)
    );
  };
  // Innermost first: a scroller that takes a stop is a focusable child of
  // the scrollers around it.
  const scrollers: HTMLElement[] = [];
  for (const element of [...root.querySelectorAll('*')].reverse()) {
    if (
      element instanceof HTMLElement &&
      !element.matches(selector) &&
      !element.isContentEditable &&
      !element.closest('[inert]') &&
      shown(element) &&
      isScroller(element) &&
      ![...tabbable, ...scrollers].some((stop) => element.contains(stop))
    ) {
      scrollers.push(element);
    }
  }
  const stops = [...tabbable, ...scrollers].sort((first, second) =>
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1
  );
  const describe = (element: HTMLElement) =>
    element.tagName.toLowerCase() +
    (element.id
      ? `#${element.id}`
      : [...element.classList]
          .slice(0, 3)
          .map((name) => `.${name}`)
          .join(''));
  stops.forEach((element, index) =>
    element.setAttribute(argument.walkAttribute, String(index))
  );
  const itemRoles: Record<string, string[]> = {
    listbox: ['option'],
    grid: ['gridcell', 'columnheader', 'rowheader'],
    tree: ['treeitem'],
    tablist: ['tab'],
    menu: ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
    radiogroup: ['radio'],
  };
  const compositeSelector = Object.keys(itemRoles)
    .map((role) => `[role="${role}"]`)
    .join(',');
  const takesTab = (element: HTMLElement) =>
    tabbable.some((stop) => element === stop || element.contains(stop));
  const isNamedElsewhere = (element: HTMLElement) =>
    element.id !== '' &&
    [
      ...document.querySelectorAll(
        '[aria-controls], [aria-owns], [aria-activedescendant]'
      ),
    ].some((other) =>
      ['aria-controls', 'aria-owns', 'aria-activedescendant'].some((name) =>
        (other.getAttribute(name) ?? '').split(/\s+/).includes(element.id)
      )
    );
  const composites: string[] = [];
  for (const composite of [
    ...(root.matches(compositeSelector) ? [root] : []),
    ...root.querySelectorAll<HTMLElement>(compositeSelector),
  ]) {
    if (!shown(composite) || composite.closest('[inert]')) continue;
    const role = composite.getAttribute('role')!;
    const items = [
      ...composite.querySelectorAll<HTMLElement>(
        itemRoles[role]!.map((item) => `[role="${item}"]`).join(',')
      ),
    ].filter(
      (item) =>
        item.closest(compositeSelector) === composite &&
        !(item instanceof HTMLInputElement && item.type === 'radio') &&
        !(item as HTMLButtonElement).disabled &&
        item.getAttribute('aria-disabled') !== 'true' &&
        shown(item)
    );
    const stopsInside = items.filter(takesTab).length;
    if (items.length > 1 && stopsInside === items.length) {
      composites.push(
        `${role} ${describe(composite)}: all ${items.length} of its items take Tab; it is one tab stop, and the arrow keys move inside it`
      );
    } else if (
      items.length > 0 &&
      stopsInside === 0 &&
      !tabbable.includes(composite) &&
      !composite.hasAttribute('aria-activedescendant') &&
      !composite.contains(document.activeElement) &&
      !isNamedElsewhere(composite)
    ) {
      composites.push(
        `${role} ${describe(composite)}: none of its ${items.length === 1 ? 'items' : `${items.length} items`} takes Tab, and neither does it, so the keyboard cannot reach it`
      );
    }
  }
  if (modal) {
    modal.setAttribute(argument.scopeAttribute, '');
  } else {
    for (const position of ['beforebegin', 'afterend'] as const) {
      const sentinel = document.createElement('span');
      sentinel.tabIndex = 0;
      sentinel.setAttribute(argument.sentinelAttribute, position);
      mount.insertAdjacentElement(position, sentinel);
    }
    (
      document.querySelector(
        `[${argument.sentinelAttribute}="beforebegin"]`
      ) as HTMLElement
    ).focus();
  }
  const segmentedTypes = ['date', 'time', 'datetime-local', 'month', 'week'];
  return {
    scope: modal ? 'modal' : 'mount',
    composites,
    stops: stops.map(describe),
    segmented: stops.flatMap((element, index) =>
      element instanceof HTMLInputElement &&
      segmentedTypes.includes(element.type)
        ? [String(index)]
        : []
    ),
  };
}

/**
 * Where focus settles after a key press: an element's number in the walk, a
 * sentinel's position, `scope` for the modal a walk goes around, `unlisted:`
 * and a description for an element in the mount or that modal that the walk
 * did not number (one that appeared after it began), or `outside:` and a
 * description for one outside it. A control may move
 * or select a frame after it takes focus, as a select-on-focus field does, so
 * focus is read again each frame until it holds for two frames, at most ten.
 * Runs in the browser.
 */
async function settledFocusPosition(argument: {
  mountId: string;
  walkAttribute: string;
  sentinelAttribute: string;
  scopeAttribute: string;
}): Promise<string> {
  const read = (): string => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return 'body';
    const sentinel = active.getAttribute(argument.sentinelAttribute);
    if (sentinel) return sentinel === 'beforebegin' ? 'before' : 'after';
    const index = active.getAttribute(argument.walkAttribute);
    if (index !== null) return index;
    if (active.hasAttribute(argument.scopeAttribute)) return 'scope';
    const description =
      active.tagName.toLowerCase() +
      (active.id
        ? `#${active.id}`
        : [...active.classList]
            .slice(0, 3)
            .map((name) => `.${name}`)
            .join(''));
    const scope =
      document.querySelector(`[${argument.scopeAttribute}]`) ??
      document.getElementById(argument.mountId);
    return `${scope?.contains(active) ? 'unlisted' : 'outside'}:${description}`;
  };
  const frame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  let position = read();
  let steady = 0;
  for (let attempt = 0; attempt < 10 && steady < 2; attempt += 1) {
    await frame();
    const next = read();
    steady = next === position ? steady + 1 : 0;
    position = next;
  }
  return position;
}

/**
 * Wait for focus to hold on the stop before the mount, putting it back if the
 * page took it. A menu open on load closes when focus leaves it and hands
 * focus to its trigger within a frame of the stop taking it; the first Tab
 * would race that, starting from the trigger or the stop. Focus has held once
 * it stays on the stop for two frames. It is put back at most twice, once for
 * an overlay and once more for one closing behind it, so this takes at most
 * six frames. A focus trap keeps focus by design: after the second time it is
 * left where the page put it, and the walk reports what Tab found from there.
 * Runs in the browser.
 */
async function holdStartingStop(argument: {
  sentinelAttribute: string;
}): Promise<void> {
  const stop = document.querySelector(
    `[${argument.sentinelAttribute}="beforebegin"]`
  ) as HTMLElement;
  const frame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  let held = 0;
  let putBack = 0;
  while (held < 2) {
    await frame();
    if (document.activeElement === stop) {
      held += 1;
    } else if (putBack < 2) {
      stop.focus();
      putBack += 1;
      held = 0;
    } else {
      return;
    }
  }
}

/** Remove what {@link prepareWalk} added. Runs in the browser. */
function finishWalk(argument: {
  walkAttribute: string;
  sentinelAttribute: string;
  scopeAttribute: string;
}) {
  for (const element of document.querySelectorAll(
    `[${argument.walkAttribute}]`
  )) {
    element.removeAttribute(argument.walkAttribute);
  }
  for (const sentinel of document.querySelectorAll(
    `[${argument.sentinelAttribute}]`
  )) {
    sentinel.remove();
  }
  document
    .querySelector(`[${argument.scopeAttribute}]`)
    ?.removeAttribute(argument.scopeAttribute);
  (document.activeElement as HTMLElement | null)?.blur?.();
}

/**
 * Walk the mounted story with the keyboard: from a stop placed before the
 * mount, Tab must reach each tabbable element in the mount in document order
 * and then a stop placed after it; from there Shift+Tab must walk the same
 * elements back. Content a story places outside the mount (a portal on the
 * body) is not part of the walk. Tab moving between the segments of a date,
 * time, datetime-local, month or week input counts as one stop, up to
 * {@link MOST_PRESSES_INSIDE_A_STOP} repeat presses; any other repeat is
 * reported.
 *
 * A modal open on the page, a native dialog opened with `showModal()` or a
 * shown element with `aria-modal="true"`, keeps focus inside it, so it is
 * walked around instead, wherever in the document it sits: from where the
 * modal put focus, Tab must reach each of the modal's tabbable elements in
 * document order and come around to the first it reached, and Shift+Tab must
 * go around the other way. Focus that leaves the modal for the page behind
 * it is reported.
 *
 * A `listbox`, `grid`, `tree`, `tablist`, `menu` or `radiogroup` in what is
 * walked must be a single tab stop: one whose items all take Tab is
 * reported, and so is one that the keyboard cannot reach, where no item
 * takes Tab and the widget neither takes it, holds focus, names an
 * `aria-activedescendant` nor is named by another element's `aria-controls`,
 * `aria-owns` or `aria-activedescendant`.
 *
 * @param page - A page with a story mounted, such as by `mountStory`.
 * @param options - The element to walk.
 * @returns What was walked, the expected order, the orders Tab and Shift+Tab
 *   took, and the failures, if any.
 * @throws When the mount is missing or holds no element, or the mounted
 *   story threw, so a walk would check nothing.
 * @example
 * ```ts
 * const walk = await walkKeyboard(page);
 * expect(walk.failures).toEqual([]);
 * ```
 */
export async function walkKeyboard(
  page: KeyboardPage,
  options: WalkKeyboardOptions = {}
): Promise<KeyboardWalk> {
  const mountId = options.mountId ?? PREVIEW_MOUNT_ELEMENT_ID;
  const attributes = {
    walkAttribute: WALK_ATTRIBUTE,
    sentinelAttribute: SENTINEL_ATTRIBUTE,
    scopeAttribute: SCOPE_ATTRIBUTE,
  };
  const elementCount = await page.evaluate(
    (id) => document.getElementById(id)?.childElementCount,
    mountId
  );
  if (!elementCount) {
    throw new Error(
      elementCount === undefined
        ? `walkKeyboard: no element has the id ${mountId}, so a walk would check nothing. Mount a story on a preview page first, or pass the \`mountId\` of an element on a page of your own.`
        : `walkKeyboard: the element #${mountId} holds no elements, so a walk would check nothing. Mount a story first, or pass the \`mountId\` of a page of your own.`
    );
  }
  const renderError = await readRenderError(page);
  if (renderError !== undefined) {
    throw new Error(
      `walkKeyboard: the mounted story threw as it rendered, so a walk would check nothing: ${renderError}`
    );
  }
  const {
    scope,
    stops: expected,
    segmented,
    composites,
  } = await page.evaluate(prepareWalk, { mountId, ...attributes });
  const describeStop = (position: string) =>
    /^\d+$/.test(position)
      ? (expected[Number(position)] ?? position)
      : position;
  const settledPosition = () =>
    page.evaluate(settledFocusPosition, { mountId, ...attributes });
  // One press more than there are elements reaches the stop after the mount,
  // or comes around a modal; a few more show where a wrong order went.
  const limit = expected.length + 3;
  async function walk(key: string, end: string): Promise<string[]> {
    const reached: string[] = [];
    let pressesInside = 0;
    while (reached.length < limit) {
      await page.keyboard.press(key);
      const position = await settledPosition();
      if (position === end) return reached;
      const repeated = position === reached.at(-1);
      if (
        repeated &&
        segmented.includes(position) &&
        pressesInside < MOST_PRESSES_INSIDE_A_STOP
      ) {
        pressesInside += 1;
        continue;
      }
      if (!repeated) pressesInside = 0;
      reached.push(position);
    }
    return reached;
  }
  // Around a modal: every element once and the first again. Focus resting on
  // the modal itself or on the body between the last element and the first
  // is the way around, not a stop.
  async function walkAround(key: string): Promise<string[]> {
    const reached: string[] = [];
    let pressesInside = 0;
    let pressesBetweenEnds = 0;
    while (reached.length <= expected.length) {
      await page.keyboard.press(key);
      const position = await settledPosition();
      if (position === 'scope' || position === 'body') {
        pressesBetweenEnds += 1;
        if (
          expected.length === 0 ||
          pressesBetweenEnds > MOST_PRESSES_BETWEEN_ENDS
        ) {
          return reached;
        }
        continue;
      }
      pressesBetweenEnds = 0;
      const repeated = position === reached.at(-1);
      if (
        repeated &&
        segmented.includes(position) &&
        pressesInside < MOST_PRESSES_INSIDE_A_STOP
      ) {
        pressesInside += 1;
        continue;
      }
      if (!repeated) pressesInside = 0;
      reached.push(position);
    }
    return reached;
  }
  // Whether a walk around a modal took the order from wherever it began and
  // ended on the element it began with.
  const wentAround = (reached: string[], order: string[]) =>
    order.length === 0
      ? reached.length === 0
      : reached.length === order.length + 1 &&
        reached.at(-1) === reached[0] &&
        order.includes(reached[0]!) &&
        order.every(
          (_, index) =>
            reached[index] ===
            order[(order.indexOf(reached[0]!) + index) % order.length]
        );
  try {
    const order = expected.map((_, index) => String(index));
    const failures: string[] = [];
    let forward: string[];
    let backward: string[];
    if (scope === 'modal') {
      const around = expected.length
        ? `${expected.join(' → ')} and around to the first again`
        : 'focus to stay in the modal';
      const aroundBack = expected.length
        ? `${[...expected].reverse().join(' → ')} and around to the first again`
        : 'focus to stay in the modal';
      forward = await walkAround('Tab');
      backward = await walkAround('Shift+Tab');
      if (!wentAround(forward, order)) {
        failures.push(
          `Tab: expected ${around}, from wherever the modal put focus; focus went to ${forward.map(describeStop).join(' → ') || 'nothing'}`
        );
      }
      if (!wentAround(backward, [...order].reverse())) {
        failures.push(
          `Shift+Tab: expected ${aroundBack}; focus went to ${backward.map(describeStop).join(' → ') || 'nothing'}`
        );
      }
      if (failures.length === 0) {
        forward = forward.slice(0, -1);
        backward = backward.slice(0, -1);
      }
    } else {
      await page.evaluate(holdStartingStop, attributes);
      forward = await walk('Tab', 'after');
      backward = await walk('Shift+Tab', 'before');
      if (forward.join() !== order.join()) {
        failures.push(
          `Tab: expected ${expected.join(' → ') || 'nothing'}; focus went to ${forward.map(describeStop).join(' → ') || 'nothing'}`
        );
      }
      if (backward.join() !== [...order].reverse().join()) {
        failures.push(
          `Shift+Tab: expected ${[...expected].reverse().join(' → ') || 'nothing'}; focus went to ${backward.map(describeStop).join(' → ') || 'nothing'}`
        );
      }
    }
    return {
      scope,
      expected,
      forward: forward.map(describeStop),
      backward: backward.map(describeStop),
      failures: [...failures, ...composites],
    };
  } finally {
    await page.evaluate(finishWalk, attributes);
  }
}
