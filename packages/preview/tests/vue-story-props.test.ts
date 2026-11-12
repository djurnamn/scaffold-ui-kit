// @vitest-environment happy-dom
// The Vue registry's render unit, mounted as the Vue pane mounts it: the
// placeholder a story-less component's default slot gets is content, not a
// prop, so it shows in the slot and reaches no element as a DOM property; a
// component that declares a prop of that name still receives it.

import { describe, expect, it } from 'vitest';
import { createApp, reactive, type Component } from 'vue';

import { emitVueRegistry } from '../src/emit/vue';
import type { ResolvedStory } from '../src/lib/types';

function story(overrides: Partial<ResolvedStory> = {}): ResolvedStory {
  return {
    name: 'Card',
    title: 'Components/Card',
    omit: false,
    standalone: true,
    unlisted: false,
    propTypes: [],
    defaultProps: { children: 'Card' },
    scenarios: [],
    slotComponents: [],
    contentSlots: { default: true, named: [] },
    ...overrides,
  } as ResolvedStory;
}

/** Mounts a story's generated template with the given component and props,
 *  and returns the mounted element and the warnings Vue gave. */
function mount(
  model: ResolvedStory,
  component: Component,
  props: Record<string, unknown>
) {
  const registry = emitVueRegistry([model], () => 'kit/vue');
  const template = JSON.parse(
    /template: ("(?:[^"\\]|\\.)*") \},$/m.exec(registry)![1]
  ) as string;
  const element = document.createElement('div');
  const warnings: string[] = [];
  const application = createApp({
    components: { Card: component },
    setup: () => ({ props: reactive(props) }),
    template,
  });
  application.config.warnHandler = (message) => warnings.push(message);
  application.mount(element);
  return { element, warnings };
}

describe('the Vue registry', () => {
  it("puts a default slot's placeholder in the slot and on no element", () => {
    const { element, warnings } = mount(
      story(),
      { template: '<article class="Card"><slot /></article>' },
      { children: 'Card', tone: 'calm' }
    );
    expect(element.querySelector('article')?.textContent).toBe('Card');
    expect(element.querySelector('article')?.getAttribute('tone')).toBe('calm');
    expect(warnings).toEqual([]);
  });

  it('keeps binding a declared prop named children', () => {
    const { element, warnings } = mount(
      story({
        propTypes: [{ name: 'children' } as ResolvedStory['propTypes'][number]],
      }),
      { props: ['children'], template: '<article>{{ children }}</article>' },
      { children: 'Declared' }
    );
    expect(element.querySelector('article')?.textContent).toBe('Declared');
    expect(warnings).toEqual([]);
  });
});
