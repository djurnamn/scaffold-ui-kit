// A component rendered around the one under test.

import type { RenderProps } from './slots.js';

/**
 * A component rendered around the one under test, for a part that renders
 * only inside its compound (a tab inside its tab list). The part becomes the
 * host's children: React's `children`, Vue's default slot, Svelte's
 * `children` snippet.
 */
export interface HostComponent {
  /** The host component, as the target's loader resolves it. */
  component: unknown;
  /** The host's own props. */
  props?: RenderProps;
}

/** A component, by export name, rendered around the one under test. */
export interface Host {
  /** The host's export name, resolved with the same target's loader. */
  name: string;
  /** The host's own props. */
  props?: RenderProps;
}

/**
 * How a component renders: {@link Host} by name through a renderer,
 * {@link HostComponent} when already loaded.
 */
export interface RenderOptions<HostShape = Host> {
  /** A component to render around it, with the part as its children. */
  host?: HostShape;
}

/**
 * A host's props, checked to leave its children to the part.
 *
 * @param host - The host, or none.
 * @returns Its props.
 * @throws When the props give the host's `children`, which the part fills.
 */
export function hostPropsWithoutChildren(host?: HostComponent): RenderProps {
  const props = host?.props ?? {};
  if ('children' in props) {
    throw new Error(
      "A host's children are the part rendered inside it; give the host no children prop."
    );
  }
  return props;
}
