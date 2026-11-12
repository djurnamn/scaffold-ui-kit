// A void element in an html slot fill (img, input, br): every pane's emitter
// writes it self-closed, since Svelte's compiler refuses `<img></img>`, and
// the resolved story refuses children on one, so check, generate and build all
// name the mistake instead of the Svelte build failing on it.

import { compile } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';
import { emitReactRegistry } from '../src/emit/react';
import { emitSvelteWrapper } from '../src/emit/svelte';
import { emitVueRegistry } from '../src/emit/vue';
import { resolveStory } from '../src/model';
import type {
  EnumeratedComponent,
  SlotFill,
  ResolvedStory,
} from '../src/lib/types';

const kit = (_name: string, target: string) => `kit/${target}`;

const image: SlotFill = {
  kind: 'html',
  tag: 'img',
  props: { src: 'hero.png', alt: '' },
};

function model(over: Partial<ResolvedStory> = {}): ResolvedStory {
  return {
    name: 'Hero',
    title: 'Components/Hero',
    omit: false,
    standalone: true,
    unlisted: false,
    propTypes: [],
    defaultProps: {},
    scenarios: [],
    slotComponents: [],
    contentSlots: { default: true, named: ['media'] },
    targets: ['react', 'vue', 'svelte'],
    slots: {
      default: {
        kind: 'html',
        tag: 'p',
        children: { kind: 'fragment', children: [{ kind: 'html', tag: 'br' }] },
      },
      named: { media: image },
    },
    ...over,
  };
}

describe('a void element in an html fill', () => {
  it('is self-closed in the React registry', () => {
    const registry = emitReactRegistry([model()], kit);
    expect(registry).toContain('media={<img src={"hero.png"} alt={""} />}');
    expect(registry).toContain('<p><br /></p>');
    expect(registry).not.toContain('</img>');
    expect(registry).not.toContain('</br>');
  });

  it('is self-closed in the Vue registry', () => {
    const registry = emitVueRegistry([model()], kit);
    expect(registry).toContain(
      `<template #media><img :src='\\"hero.png\\"' :alt='\\"\\"' /></template>`
    );
    expect(registry).toContain('<p><br /></p>');
    expect(registry).not.toContain('</img>');
  });

  it('is self-closed in the Svelte wrapper, which the Svelte compiler accepts', () => {
    const wrapper = emitSvelteWrapper(model(), () => './barrel.js');
    expect(wrapper.source).toContain(
      '{#snippet media()}<img src={"hero.png"} alt={""} />{/snippet}'
    );
    expect(wrapper.source).not.toContain('</img>');
    expect(() =>
      compile(wrapper.source, {
        generate: 'client',
        filename: wrapper.fileName,
      })
    ).not.toThrow();
  });
});

describe('resolveStory - children on a void element', () => {
  const component: EnumeratedComponent = {
    name: 'Hero',
    file: 'Hero.ts',
    props: {},
    hasDefaultSlot: true,
    slotNames: ['media'],
  };

  it('refuses them, naming the component and the tag, at any depth', () => {
    expect(() =>
      resolveStory(
        component,
        {
          slots: {
            named: {
              media: {
                kind: 'fragment',
                children: [
                  {
                    kind: 'html',
                    tag: 'figure',
                    children: {
                      kind: 'html',
                      tag: 'img',
                      children: { kind: 'text', value: 'caption' },
                    },
                  },
                ],
              },
            },
          },
        },
        {}
      )
    ).toThrow(
      'Hero: the html fill <img> has children - img is a void element and takes none'
    );
  });

  it('accepts a void element without them', () => {
    expect(() =>
      resolveStory(component, { slots: { named: { media: image } } }, {})
    ).not.toThrow();
  });
});
