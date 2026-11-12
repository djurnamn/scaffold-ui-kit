// A custom view written as a React render function, adapted to the
// framework-neutral view contract (views.ts): it renders into its own React
// root and re-renders with each new context, so the view's own state lasts
// across option changes.

import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { RenderedView, ViewContext } from './views.js';

/** A React view's render function: the view's element tree for a context. */
export type ReactViewRender = (context: ViewContext) => ReactNode;

/**
 * Make a view's `framework` and `mount` from a React render function. The
 * view iframe then loads the kit's React setup module before mounting it.
 *
 * @param render - Renders the view for a context; called again with each new one.
 * @returns The view's `framework` (`'react'`) and `mount`, to spread into its entry.
 * @example
 * ```tsx
 * export const views: PreviewView[] = [
 *   {
 *     id: 'foundations',
 *     label: 'Foundations',
 *     ...reactView((context) => <Foundations theme={String(context.options.theme)} />),
 *   },
 * ];
 * ```
 */
export function reactView(
  render: ReactViewRender
): Required<Pick<RenderedView, 'framework' | 'mount'>> {
  return {
    framework: 'react',
    mount(element, context, updates) {
      const root = createRoot(element);
      root.render(render(context));
      const stop = updates?.subscribe((next) => root.render(render(next)));
      return () => {
        stop?.();
        root.unmount();
      };
    },
  };
}
