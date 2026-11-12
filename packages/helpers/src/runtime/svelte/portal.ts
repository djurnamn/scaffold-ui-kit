import { createAttachmentKey } from 'svelte/attachments';

/** Where a portal moves its node: a selector, or the element itself. */
export type PortalTarget = string | HTMLElement;

/**
 * A Svelte action that moves its node into another container, `document.body`
 * by default: Svelte's counterpart of React's `createPortal` and Vue's
 * `<Teleport>`. A template points at it with a per-target attribute,
 * `use:portal={'body'}`. A target that matches nothing leaves the node where
 * it is.
 *
 * @param node - The element to move.
 * @param target - A selector or an element; `'body'` by default.
 * @returns The action's `update`, which moves the node to a new target, and
 *   `destroy`, which removes it.
 *
 * @example
 * ```svelte
 * <script>
 *   import { portal } from '@scaffold-ui-kit/helpers/runtime/svelte';
 * </script>
 *
 * <div use:portal={'body'}>...</div>
 * ```
 */
export function portal(node: HTMLElement, target: PortalTarget = 'body') {
  const mount = (to: PortalTarget) => {
    const container =
      typeof to === 'string' ? document.querySelector<HTMLElement>(to) : to;
    container?.appendChild(node);
  };

  mount(target);

  return {
    update(to: PortalTarget) {
      mount(to);
    },
    destroy() {
      node.parentNode?.removeChild(node);
    },
  };
}

const portalKey = createAttachmentKey();
const portalAttachments = new Map<string, (node: Element) => () => void>();

/**
 * The attachment form of {@link portal}, for a component that spreads its
 * props onto its root: `{...portalTo('body')}` moves that root into the
 * target. Each selector has one attachment, so spreading it again on every
 * render keeps the node where it is.
 *
 * @param target - A selector; `'body'` by default.
 * @returns A record to spread onto the element.
 *
 * @example
 * ```svelte
 * <Panel {...rest} {...portalTo('body')} />
 * ```
 */
export function portalTo(target = 'body'): Record<symbol, unknown> {
  let attach = portalAttachments.get(target);
  if (!attach) {
    attach = (node: Element) => {
      document.querySelector(target)?.appendChild(node);
      return () => node.remove();
    };
    portalAttachments.set(target, attach);
  }
  return { [portalKey]: attach };
}
