import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSSRApp, defineComponent, h, type Slots } from 'vue';
import { renderToString } from 'vue/server-renderer';

import { renderVue, scopedSlot } from '../src/render/index.js';

// Run by the package's test script under NODE_ENV=production.

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const Scoped = defineComponent({
  setup(_props, { slots }: { slots: Slots }) {
    return () => h('div', slots.trigger?.({ value: 'Ada' }));
  },
});

it('runs on the production build, which hides a render error by default', async () => {
  const application = createSSRApp({
    render() {
      throw new Error('x');
    },
  });
  await expect(renderToString(application)).resolves.toBe('<!---->');
});

it('rejects on a wrong binding, which the production build would hide', async () => {
  await expect(
    renderVue(Scoped, { trigger: scopedSlot('nope', 'Go') })
  ).rejects.toThrow("The scope's keys are value.");
});
