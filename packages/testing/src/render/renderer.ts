// A kit's components rendered by name in each target it hands a loader for.

import type { Host, HostComponent, RenderOptions } from './host.js';
import { renderReact } from './react.js';
import type { RenderProps } from './slots.js';
import { renderSvelte, svelteHost } from './svelte.js';
import { renderVue } from './vue.js';

/** A target the renderer renders on the server. */
export type Target = 'react' | 'vue' | 'svelte';

/** The targets, in the order {@link Renderer.renderAll} renders them. */
export const TARGETS: readonly Target[] = ['react', 'vue', 'svelte'];

/**
 * Resolves one of a kit's components by its export name: the React component
 * function, the Vue component, the Svelte component.
 */
export type ComponentLoader = (exportName: string) => Promise<unknown>;

/** One {@link ComponentLoader} per target the kit renders. */
export type ComponentLoaders = Partial<Record<Target, ComponentLoader>>;

/** Renders a kit's components by name; made by {@link createRenderer}. */
export interface Renderer {
  /** The targets the kit handed a loader for, in {@link TARGETS} order. */
  readonly targets: readonly Target[];
  /**
   * Load components ahead of their first render, in every target, and compile
   * the Svelte host when the kit has a Svelte loader, so a test file can pay
   * a cold import in a `beforeAll` of its own time limit.
   */
  load(...names: string[]): Promise<void>;
  /** Render a component in one target. */
  render(
    target: Target,
    name: string,
    props?: RenderProps,
    options?: RenderOptions
  ): Promise<string>;
  /** Render a component in every target the kit handed a loader for. */
  renderAll(
    name: string,
    props?: RenderProps,
    options?: RenderOptions
  ): Promise<Partial<Record<Target, string>>>;
}

/** The error for a target the renderer does not render. */
function notARenderTarget(target: string): Error {
  const targets = `The targets are ${TARGETS.join(', ')}`;
  return new Error(
    target === 'html'
      ? `html is not a render target. ${targets}; storySource from @scaffold-ui-kit/preview renders the html.`
      : `${target} is not a render target. ${targets}.`
  );
}

/**
 * Render a loaded component in a target on the server.
 *
 * @param target - The target the component belongs to.
 * @param component - The component, as the target's loader resolves it.
 * @param props - Its props, slot fills included.
 * @param options - A component to render around it.
 * @returns The rendered markup.
 * @throws When the target is not one the renderer renders: `html` has no
 *   server render here, and `storySource` from the preview package prints it.
 */
export function renderComponent(
  target: Target,
  component: unknown,
  props: RenderProps = {},
  options: RenderOptions<HostComponent> = {}
): Promise<string> {
  switch (target) {
    case 'react':
      return renderReact(component, props, options);
    case 'vue':
      return renderVue(component, props, options);
    case 'svelte':
      return renderSvelte(component, props, options);
    default:
      return Promise.reject(notARenderTarget(target));
  }
}

/**
 * Make a renderer for a kit's components from one loader per target. The kit
 * keeps its build layout to itself: each loader finds a component by export
 * name, a compound's parts included. Each component loads once.
 *
 * @param loaders - The loader for each target the kit renders.
 * @returns The renderer.
 * @throws When a loader is given for a target the renderer does not render.
 * @example
 * ```ts
 * const renderer = createRenderer({
 *   react: async (name) => (await import(`../dist/react/${name}.tsx`))[name],
 *   vue: async (name) => (await import(`../dist/vue/${name}.vue`)).default,
 *   svelte: async (name) => (await import(`../dist/svelte/${name}.svelte`)).default,
 * });
 * const markup = await renderer.renderAll('Badge', { tone: 'calm', children: slot('New') });
 * ```
 */
export function createRenderer(loaders: ComponentLoaders): Renderer {
  for (const target of Object.keys(loaders)) {
    if (!TARGETS.includes(target as Target)) throw notARenderTarget(target);
  }
  const targets = TARGETS.filter((target) => loaders[target] !== undefined);
  const loaded = new Map<string, Promise<unknown>>();

  function component(target: Target, name: string): Promise<unknown> {
    if (!TARGETS.includes(target)) {
      return Promise.reject(notARenderTarget(target));
    }
    const loader = loaders[target];
    if (!loader) {
      return Promise.reject(
        new Error(`No loader was given for the ${target} target.`)
      );
    }
    const key = `${target}:${name}`;
    let found = loaded.get(key);
    if (!found) {
      found = loader(name).then((resolved) => {
        if (resolved === undefined || resolved === null) {
          throw new Error(
            `The ${target} loader resolved no component named ${name}.`
          );
        }
        return resolved;
      });
      // A failed load is retried on the next call rather than cached.
      found.catch(() => loaded.delete(key));
      loaded.set(key, found);
    }
    return found;
  }

  async function render(
    target: Target,
    name: string,
    props: RenderProps = {},
    options: RenderOptions = {}
  ): Promise<string> {
    const resolved = await component(target, name);
    const host = options.host
      ? {
          component: await component(target, options.host.name),
          props: options.host.props,
        }
      : undefined;
    return renderComponent(target, resolved, props, { host });
  }

  return {
    targets,
    async load(...names) {
      await Promise.all([
        ...targets.flatMap((target) =>
          names.map((name) => component(target, name))
        ),
        ...(loaders.svelte ? [svelteHost()] : []),
      ]);
    },
    render,
    async renderAll(name, props = {}, options = {}) {
      const rendered: Partial<Record<Target, string>> = {};
      for (const target of targets) {
        rendered[target] = await render(target, name, props, options);
      }
      return rendered;
    },
  };
}
