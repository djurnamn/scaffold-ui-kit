// The Vue target's server render, through createSSRApp and vue/server-renderer.

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

type VueSlot = (scope?: RenderProps) => unknown;

interface VueApplication {
  config: { throwUnhandledErrorInProduction?: boolean };
}

interface VueRuntime {
  createSSRApp(root: { render: () => unknown }): VueApplication;
  h(type: unknown, props?: RenderProps | null, children?: unknown): unknown;
}

interface VueServer {
  renderToString(
    application: VueApplication,
    context: { teleports?: Record<string, string> }
  ): Promise<string>;
}

/** Vue names the default slot `default`; the other targets call it `children`. */
function vueSlotName(name: string): string {
  return name === 'children' ? 'default' : name;
}

/**
 * Render a Vue component to markup on the server, with `createSSRApp` and
 * `renderToString`. A {@link slot} fill becomes a slot and a
 * {@link scopedSlot} fill a scoped slot, the `children` prop the default
 * slot. What the component teleports, Vue writes apart from the markup; it is
 * appended after it, ordered by teleport target, as a page would hold it.
 *
 * @param component - The component, as its module's default export.
 * @param props - Its props, slot fills included.
 * @param options - `host`, a component to render around it, with the part
 *   as its default slot; its props take slot fills too, its `children` excepted.
 * @returns The rendered markup.
 * @example
 * ```ts
 * const { default: Badge } = await import('../dist/vue/Badge.vue');
 * const markup = await renderVue(Badge, { tone: 'calm', children: slot('New') });
 * ```
 */
export async function renderVue(
  component: unknown,
  props: RenderProps = {},
  { host }: RenderOptions<HostComponent> = {}
): Promise<string> {
  const { createSSRApp, h } = (await import('vue')) as unknown as VueRuntime;
  const { renderToString } = (await import(
    'vue/server-renderer'
  )) as unknown as VueServer;
  const own = vueProps(props, h);
  const part = () =>
    h(
      component,
      own.plain,
      Object.keys(own.slots).length > 0 ? own.slots : undefined
    );
  const hosted = vueProps(hostPropsWithoutChildren(host), h);
  const application = createSSRApp({
    render: () =>
      host
        ? h(host.component, hosted.plain, { ...hosted.slots, default: part })
        : part(),
  });
  // A production build otherwise logs a render error and writes a comment.
  application.config.throwUnhandledErrorInProduction = true;
  const context: { teleports?: Record<string, string> } = {};
  const body = await renderToString(application, context);
  const teleports = context.teleports ?? {};
  return (
    body +
    Object.keys(teleports)
      .sort()
      .map((target) => teleports[target])
      .join('')
  );
}

/** Props split into Vue's plain props and its slots, each fill a slot. */
function vueProps(
  props: RenderProps,
  createVirtualNode: VueRuntime['h']
): { plain: RenderProps; slots: Record<string, VueSlot> } {
  const { plain, slots, scopedSlots } = partitionProps(props);
  const vueSlots: Record<string, VueSlot> = {};
  for (const [name, fill] of Object.entries(slots)) {
    vueSlots[vueSlotName(name)] = () =>
      createVirtualNode('em', { class: SLOT_FILL_CLASS }, fill.slotFillText);
  }
  for (const [name, fill] of Object.entries(scopedSlots)) {
    vueSlots[vueSlotName(name)] = (scope?: RenderProps) =>
      createVirtualNode(
        'button',
        {
          ...scopedFillAttributes(fill, scope),
          class: SLOT_FILL_CLASS,
        },
        fill.scopedSlotText
      );
  }
  return { plain, slots: vueSlots };
}
