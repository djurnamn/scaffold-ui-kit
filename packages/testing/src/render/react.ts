// The React target's server render, through react-dom/server.

import {
  hostPropsWithoutChildren,
  type HostComponent,
  type RenderOptions,
} from './host.js';
import {
  SLOT_FILL_CLASS,
  partitionProps,
  scopedFillAttributes,
  type RenderProps,
} from './slots.js';

interface ReactRuntime {
  createElement(
    type: unknown,
    props?: RenderProps | null,
    ...children: unknown[]
  ): unknown;
}

interface ReactServer {
  renderToStaticMarkup(element: unknown): string;
}

/**
 * Render a React component to static markup, with `renderToStaticMarkup`. A
 * {@link slot} fill becomes a React node and a {@link scopedSlot} fill a
 * function of the scope, which spreads the scope's record onto its button.
 *
 * @param component - The component.
 * @param props - Its props, slot fills included.
 * @param options - `host`, a component to render around it, with the part
 *   as its children; its props take slot fills too, its `children` excepted.
 * @returns The rendered markup.
 * @example
 * ```ts
 * const { Badge } = await import('../dist/react/Badge.tsx');
 * const markup = await renderReact(Badge, { tone: 'calm', children: slot('New') });
 * ```
 */
export async function renderReact(
  component: unknown,
  props: RenderProps = {},
  { host }: RenderOptions<HostComponent> = {}
): Promise<string> {
  const { createElement } = (await import('react')) as unknown as ReactRuntime;
  const { renderToStaticMarkup } = (await import(
    'react-dom/server'
  )) as unknown as ReactServer;
  const element = createElement(component, reactProps(props, createElement));
  if (!host) return renderToStaticMarkup(element);
  return renderToStaticMarkup(
    createElement(
      host.component,
      reactProps(hostPropsWithoutChildren(host), createElement),
      element
    )
  );
}

/** Props with each slot fill as React takes it. */
function reactProps(
  props: RenderProps,
  createElement: ReactRuntime['createElement']
): RenderProps {
  const { plain, slots, scopedSlots } = partitionProps(props);
  const resolved: RenderProps = { ...plain };
  for (const [name, fill] of Object.entries(slots)) {
    resolved[name] = createElement(
      'em',
      { className: SLOT_FILL_CLASS },
      fill.slotFillText
    );
  }
  for (const [name, fill] of Object.entries(scopedSlots)) {
    resolved[name] = (scope: unknown) =>
      createElement(
        'button',
        {
          ...scopedFillAttributes(fill, scope),
          className: SLOT_FILL_CLASS,
        },
        fill.scopedSlotText
      );
  }
  return resolved;
}
