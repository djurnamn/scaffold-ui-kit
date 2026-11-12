// The Svelte pane's story props: one object for the component's props that
// never changes, each of whose props reads a signal of its own. An update
// sets the props whose values changed alone, and a prop the story leaves out
// is never set, as a parent leaves it. Were the whole object replaced, every
// prop would read as set again, and a component's own two-way value (a
// bindable the story leaves out) would go back to its default whenever
// another prop changed: Svelte keeps a prop the component assigns only until
// the prop is read anew. An array or object the story gives again with the
// same content, as each message from the host does, is the same value: the
// host compares values the same way.

import { stableStringify } from '../../../src/controller/editor-tree';
import {
  isPlainData,
  PendingWriteBacks,
  withEventRecorders,
  withWriteBacks,
  type PreviewWriteBack,
} from '../../../src/protocol';

/** A prop's value in a box, so it stays the value it is: a `$state` record
 *  wraps an array or plain object in a proxy of its own, a class instance not. */
export class GivenProp {
  constructor(readonly value: unknown) {}
}

/** The props a story gives, by name, each in a box: a `$state` record, so
 *  each prop is a signal of its own. */
export type GivenProps = Record<string, GivenProp>;

/**
 * The component's props, read from `given`: an object that never changes,
 * whose each prop reads its own box, so a read of one prop depends on that
 * prop alone.
 *
 * @param given - The story's props, a `$state` record of boxes.
 * @returns The props to spread on the component.
 * @example
 * ```ts
 * const given = $state<GivenProps>({});
 * const props = storyProps(given);
 * ```
 */
export function storyProps(given: GivenProps): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get: (_, key) =>
        typeof key === 'string' ? given[key]?.value : undefined,
      has: (_, key) => typeof key === 'string' && key in given,
      ownKeys: () => Reflect.ownKeys(given),
      getOwnPropertyDescriptor: (_, key) =>
        typeof key === 'string' && key in given
          ? {
              value: given[key].value,
              enumerable: true,
              configurable: true,
              writable: true,
            }
          : undefined,
    }
  );
}

/**
 * Whether a prop's value is the one it had: the same value, or arrays or
 * plain objects of plain data holding the same content.
 *
 * @param previous - The value it had.
 * @param next - The value it is given.
 * @returns `true` when nothing changed.
 */
export function sameValue(previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) return true;
  return (
    typeof previous === 'object' &&
    previous !== null &&
    typeof next === 'object' &&
    next !== null &&
    isPlainData(previous) &&
    isPlainData(next) &&
    stableStringify(previous) === stableStringify(next)
  );
}

/**
 * Set the story's props to `next`: a prop whose value changed gets a new box,
 * one `next` leaves out is deleted, and the others stay as they are. An array
 * or object with the content it had stays as it is (see {@link sameValue}).
 *
 * @param given - The story's props, a `$state` record of boxes.
 * @param next - The props the story gives now.
 */
export function setStoryProps(
  given: GivenProps,
  next: Record<string, unknown>
): void {
  for (const key of Object.keys(given)) if (!(key in next)) delete given[key];
  for (const [key, value] of Object.entries(next))
    if (!(key in given) || !sameValue(given[key].value, value))
      given[key] = new GivenProp(value);
}

/** What a story the host sets brings beside its props. */
export interface StorySettings {
  /** The function props whose calls the pane records. */
  events?: readonly string[];
  /** The two-way props and the events they report through. */
  bindings?: readonly PreviewWriteBack[];
  /** The host's mount of the story, which each recorded event carries. */
  mount?: number;
}

/**
 * The Svelte pane's story props as the host's messages set them. A story's
 * events are recorded, and a controlled story takes a two-way prop's new
 * value in the event that reports it, as the React and Vue panes do: the
 * story's prop holds the value the component has taken by the time the
 * host echoes it, and props the host sent before it took the pane's newest
 * write keep that value (`answers`, see {@link PendingWriteBacks}). A new
 * story forgets the last one's writes.
 *
 * @param given - The story's props, a `$state` record of boxes.
 * @param target - The pane's window, which events are reported from.
 * @returns `setStory` for a story the host sets, `setProps` for its props.
 * @example
 * ```ts
 * const story = paneProps(given);
 * story.setStory({ value: 'a' }, { bindings: [{ prop: 'value', changeProp: 'onValueChange' }] });
 * story.setProps({ value: 'ab' }, 1);
 * ```
 */
export function paneProps(
  given: GivenProps,
  target: Window = window
): {
  setStory: (props: Record<string, unknown>, settings?: StorySettings) => void;
  setProps: (props: Record<string, unknown>, answers?: number) => void;
} {
  let settings: StorySettings = {};
  const pending = new PendingWriteBacks();
  function apply(next: Record<string, unknown>): void {
    setStoryProps(
      given,
      withWriteBacks(
        withEventRecorders(
          next,
          settings.events,
          target,
          settings.mount,
          pending
        ),
        settings.bindings,
        (prop, value) => {
          pending.wrote(prop, value);
          if (prop in given && !sameValue(given[prop].value, value))
            given[prop] = new GivenProp(value);
        }
      )
    );
  }
  return {
    setStory(props, next = {}) {
      settings = next;
      pending.clear();
      apply(props);
    },
    setProps(props, answers) {
      apply(pending.reconcile(props, answers));
    },
  };
}
