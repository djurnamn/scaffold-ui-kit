import { createRenderer } from '@scaffold-ui-kit/testing/render';

export const renderer = createRenderer({
  react: async (name) => (await import(`../dist/react/${name}.tsx`))[name],
  vue: async (name) => (await import(`../dist/vue/${name}.vue`)).default,
  svelte: async (name) =>
    (await import(`../dist/svelte/${name}.svelte`)).default,
});
