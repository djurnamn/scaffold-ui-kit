// Regression tests for the resolved story's default-slot auto-fill. The visible
// placeholder (`children = component.name`) exists so a component with a
// default slot and NO story file curation renders something; it must not fire on
// a story file that curates any slot - a named fill beside injected children
// fabricates a mount no consumer writes (a Button rendering its composed label
// AND a projected "Button" child).

import { describe, expect, it } from 'vitest';
import { catalogFromManifest } from '../src/controller';
import { buildManifest } from '../src/emit/manifest';
import { bindingsOf, resolveStory } from '../src/model';
import type { EnumeratedComponent, Story } from '../src/lib/types';

function component(over: Partial<EnumeratedComponent> = {}): EnumeratedComponent {
  return {
    name: 'Button',
    file: 'Button.ts',
    props: { label: { type: 'string' } },
    hasDefaultSlot: true,
    slotNames: ['icon'],
    ...over,
  };
}

describe('resolveStory - default-slot auto-fill', () => {
  it('injects the visible name when there is no story file', () => {
    const story = resolveStory(component(), undefined, {});
    expect(story.defaultProps.children).toBe('Button');
  });

  it('injects the visible name for a story file with no slot plan', () => {
    const storyFile: Story = { category: 'Actions' };
    const story = resolveStory(component(), storyFile, {});
    expect(story.defaultProps.children).toBe('Button');
  });

  it('does not inject beside a named-only slot plan', () => {
    // The Button shape: curated label + a named icon fill, no default fill.
    // Injecting children here rendered "Button Button" in the story.
    const storyFile: Story = {
      defaultProps: { label: 'Click me' },
      slots: { named: { icon: { kind: 'element', component: 'IconStar' } } },
    };
    const story = resolveStory(component(), storyFile, {});
    expect(story.defaultProps.children).toBeUndefined();
    expect(story.defaultProps.label).toBe('Click me');
  });

  it('does not inject into a default slot that exposes values', () => {
    // A scoped default slot's content is a function of the values it
    // exposes: React calls children(scope), so a string there crashes the
    // pane. With no seed the slot's fallback renders in every target.
    const story = resolveStory(
      component({ defaultSlotScoped: true }),
      undefined,
      {}
    );
    expect(story.defaultProps.children).toBeUndefined();
    expect(story.contentSlots.default).toBe(true);
  });

  it('lists a slot whose content must take its scope with the others, marked', () => {
    const story = resolveStory(
      component({
        defaultSlotScoped: true,
        slotNames: ['trigger', 'icon'],
        scopeRequiredSlots: ['default', 'trigger'],
      }),
      undefined,
      {}
    );
    expect(story.contentSlots).toEqual({
      default: true,
      named: ['trigger', 'icon'],
      scopeRequired: ['default', 'trigger'],
    });
  });

  it('refuses an element fill that sets slots.default, at any depth', () => {
    const storyFile: Story = {
      slots: {
        named: {
          icon: {
            kind: 'fragment',
            children: [
              {
                kind: 'element',
                component: 'Card',
                slots: { default: { kind: 'text', value: 'x' } },
              },
            ],
          },
        },
      },
    };
    expect(() => resolveStory(component(), storyFile, {})).toThrow(
      "Button: the element fill of 'Card' sets slots.default - its default slot takes children"
    );
  });

  it('refuses a key a curated scenario does not hold', () => {
    const storyFile = {
      scenarios: [{ id: 'odd', content: true }],
    } as unknown as Story;
    expect(() => resolveStory(component(), storyFile, {})).toThrow(
      "Button: scenario 'odd' sets unknown key 'content' - a scenario sets id, label, description, props, slots, options, default"
    );
  });

  it('refuses a key a story file does not take, naming the keys it does', () => {
    const storyFile = { partials: true } as unknown as Story;
    expect(() => resolveStory(component(), storyFile, {})).toThrow(
      "Button: story sets unknown key 'partials' - a story sets omit, standalone, unlisted, category, label, defaultProps, controls, fixed, generate, slots, around, scenarios, options"
    );
  });

  it("says to use standalone: false for a story's partial key", () => {
    const storyFile = { partial: true } as unknown as Story;
    expect(() => resolveStory(component(), storyFile, {})).toThrow(
      "Button: story sets unknown key 'partial' - use standalone: false"
    );
  });

  it('takes every key a story file can set', () => {
    const storyFile: Required<Story> = {
      omit: false,
      standalone: true,
      unlisted: false,
      category: 'Inputs',
      label: 'Button',
      defaultProps: {},
      controls: {},
      fixed: {},
      generate: false,
      slots: {},
      around: {},
      scenarios: [],
      options: {},
    };
    expect(() => resolveStory(component(), storyFile, {})).not.toThrow();
  });

  it('leaves the scenarios the preview generates unchecked', () => {
    const storyFile = {
      scenarios: [
        { id: 'variant-dense', label: 'variant: dense', generated: true },
      ],
    } as unknown as Story;
    expect(() => resolveStory(component(), storyFile, {})).not.toThrow();
  });

  it('does not inject when the story file fills the default slot', () => {
    const storyFile: Story = {
      slots: { default: { kind: 'text', value: 'Save' } },
    };
    const story = resolveStory(component(), storyFile, {});
    expect(story.defaultProps.children).toBeUndefined();
  });

  it('does not inject for an empty slot plan (forced slotless mount)', () => {
    // `slots: {}` is the opt-out: a story that wants the component's own
    // default-slot fallback content mounts genuinely slotless.
    const storyFile: Story = { slots: {} };
    const story = resolveStory(component(), storyFile, {});
    expect(story.defaultProps.children).toBeUndefined();
  });

  it('never injects for a component without a default slot', () => {
    const story = resolveStory(component({ hasDefaultSlot: false }), undefined, {});
    expect(story.defaultProps.children).toBeUndefined();
  });

  it('keeps story-file children over the injected name', () => {
    const storyFile: Story = { defaultProps: { children: 'Authored' } };
    const story = resolveStory(component(), storyFile, {});
    expect(story.defaultProps.children).toBe('Authored');
  });
});

describe('resolveStory - prop descriptions', () => {
  it("carries a prop's template description to its control, through a story file override", () => {
    const story = resolveStory(
      component({
        props: {
          label: { type: 'string', description: 'The text the button shows.' },
          tone: { type: "'neutral' | 'critical'" },
        },
      }),
      { controls: { label: { control: 'text' } } },
      {}
    );
    expect(story.propTypes.find((propType) => propType.name === 'label')?.description).toBe('The text the button shows.');
    expect(story.propTypes.find((propType) => propType.name === 'tone')?.description).toBeUndefined();
  });
});

describe('resolveStory - prop declarations', () => {
  it("carries each prop's declared type, whether it is required and its own default, apart from the story's defaults", () => {
    const story = resolveStory(
      component({
        props: {
          label: { type: 'string', required: true },
          tone: { type: "'neutral' | 'critical'", default: 'neutral' },
        },
      }),
      { defaultProps: { tone: 'critical' }, controls: { tone: { control: 'text' } } },
      {}
    );
    const declaration = (name: string) => {
      const propType = story.propTypes.find((candidate) => candidate.name === name)!;
      return { declaredType: propType.declaredType, required: propType.required, declaredDefault: propType.declaredDefault };
    };
    expect(declaration('label')).toEqual({ declaredType: 'string', required: true, declaredDefault: undefined });
    expect('declaredDefault' in story.propTypes[0]).toBe(false);
    // A story file's control tweak and its defaultProps leave the declaration alone.
    expect(declaration('tone')).toEqual({ declaredType: "'neutral' | 'critical'", required: false, declaredDefault: 'neutral' });
    expect(story.defaultProps.tone).toBe('critical');
  });

  it('carries a default the component documents without declaring, and starts the story without it', () => {
    const story = resolveStory(
      component({
        props: {
          side: { type: "'start' | 'end'", documentedDefault: "'start'" },
          tone: { type: "'neutral' | 'critical'", default: 'neutral' },
        },
      }),
      {},
      {}
    );
    const side = story.propTypes.find((propType) => propType.name === 'side')!;
    expect(side.documentedDefault).toBe("'start'");
    expect('declaredDefault' in side).toBe(false);
    expect('side' in story.defaultProps).toBe(false);
    expect('documentedDefault' in story.propTypes.find((propType) => propType.name === 'tone')!).toBe(false);
  });
});

describe('resolveStory - omission by name', () => {
  it("leaves a component out only when the kit's pattern matches its name", () => {
    const visual = component({ name: 'ButtonVisual' });
    expect(resolveStory(visual, undefined, {}).omit).toBe(false);
    expect(resolveStory(visual, undefined, {}, {}, /(Driver|Visual)$/).omit).toBe(true);
    expect(resolveStory(component(), undefined, {}, {}, /(Driver|Visual)$/).omit).toBe(false);
  });
});

describe('descriptions', () => {
  const storyFile: Story = {
    scenarios: [
      { id: 'destructive', label: 'Destructive', description: 'For an action that **cannot** be undone.', props: { label: 'Delete' } },
      { id: 'plain', props: { label: 'Plain' } },
    ],
  };

  it("carries the component's description and each scenario's into the resolved story", () => {
    const story = resolveStory(component({ description: 'A pressable control.' }), storyFile, {});
    expect(story.description).toBe('A pressable control.');
    expect(story.scenarios.map(({ id, description }) => [id, description])).toEqual([
      ['destructive', 'For an action that **cannot** be undone.'],
      ['plain', undefined],
    ]);
    expect('description' in resolveStory(component(), undefined, {})).toBe(false);
  });

  it('rejects a scenario description that is not a string, naming the component and scenario', () => {
    const wrong = { scenarios: [{ id: 'odd', description: ['two', 'lines'] }] } as unknown as Story;
    expect(() => resolveStory(component(), wrong, {})).toThrow(
      "Button: scenario 'odd' has a description that is not a string."
    );
  });

  it('rejects scenario options that are not option values by id', () => {
    for (const options of [['dark'], { mode: 3 }, 'dark']) {
      const wrong = { scenarios: [{ id: 'odd', options }] } as unknown as Story;
      expect(() => resolveStory(component(), wrong, {})).toThrow(
        "Button: scenario 'odd' has options that are not option values by id, each a string or a boolean."
      );
    }
  });

  it("writes a scenario's option values into the manifest and the catalog, and leaves out none set", () => {
    const story = resolveStory(
      component(),
      { scenarios: [{ id: 'dark', options: { mode: 'dark', padded: false } }, { id: 'plain', options: {} }] },
      {}
    );
    const manifest = buildManifest([story], [{ id: 'core', label: 'Components', order: 0 }]);
    expect(manifest.components[0].scenarios[0].options).toEqual({ mode: 'dark', padded: false });
    expect('options' in manifest.components[0].scenarios[1]).toBe(false);
    const catalog = catalogFromManifest(manifest);
    expect(catalog.components[0].scenarios.find((scenario) => scenario.id === 'dark')?.options).toEqual({
      mode: 'dark',
      padded: false,
    });
  });

  it('writes both into the manifest and passes them through to the catalog', () => {
    const story = resolveStory(component({ description: 'A pressable control.' }), storyFile, {});
    const manifest = buildManifest([story], [{ id: 'core', label: 'Components', order: 0 }]);
    const [entry] = manifest.components;
    expect(entry.description).toBe('A pressable control.');
    expect(entry.scenarios[0]).toEqual({
      id: 'destructive',
      label: 'Destructive',
      description: 'For an action that **cannot** be undone.',
      props: { label: 'Delete' },
    });
    expect('description' in entry.scenarios[1]).toBe(false);

    const catalog = catalogFromManifest(manifest);
    const button = catalog.components[0];
    expect(button.description).toBe('A pressable control.');
    expect(button.scenarios.find((scenario) => scenario.id === 'destructive')?.description).toBe(
      'For an action that **cannot** be undone.'
    );
    expect(button.scenarios.find((scenario) => scenario.id === 'empty')?.description).toBeUndefined();

    const bare = catalogFromManifest(buildManifest([resolveStory(component(), undefined, {})], []));
    expect('description' in bare.components[0]).toBe(false);
  });
});

describe('unlisted stories', () => {
  const sources = [{ id: 'core', label: 'Components', order: 0 }];

  it('flags a story unlisted from its story file or its manual spec', () => {
    expect(resolveStory(component(), undefined, {}).unlisted).toBe(false);
    expect(resolveStory(component(), { unlisted: true }, {}).unlisted).toBe(true);
    expect(resolveStory(component({ unlisted: true }), undefined, {}).unlisted).toBe(true);
  });

  it('leaves an omitted component or one that is not standalone unflagged: it has no story to hide', () => {
    const omitted = resolveStory(component(), { unlisted: true, omit: true }, {});
    expect([omitted.omit, omitted.unlisted]).toEqual([true, false]);
    const editorOnly = resolveStory(component(), { unlisted: true, standalone: false }, {});
    expect([editorOnly.standalone, editorOnly.unlisted]).toEqual([false, false]);
    const named = resolveStory(component({ name: 'ButtonVisual' }), { unlisted: true }, {}, {}, /Visual$/);
    expect([named.omit, named.unlisted]).toEqual([true, false]);
  });

  it('keeps an unlisted story in the manifest and the catalog, flagged, and out of the navigation', () => {
    const listed = resolveStory(component(), undefined, {});
    const unlisted = resolveStory(component({ name: 'Probe' }), { unlisted: true }, {});
    const manifest = buildManifest([listed, unlisted], sources);
    expect(manifest.components.map((entry) => [entry.name, entry.unlisted])).toEqual([
      ['Button', undefined],
      ['Probe', true],
    ]);
    expect('unlisted' in manifest.components[0]).toBe(false);

    const catalog = catalogFromManifest(manifest);
    expect(catalog.components.map((entry) => [entry.id, entry.unlisted])).toEqual([
      ['components-button', false],
      ['components-probe', true],
    ]);
    expect(JSON.stringify(catalog.navigation)).not.toContain('components-probe');
    expect(JSON.stringify(catalog.navigation)).toContain('components-button');
  });

  it('leaves a source whose stories are all unlisted out of the navigation', () => {
    const unlisted = resolveStory(component({ name: 'Probe' }), { unlisted: true }, {});
    expect(catalogFromManifest(buildManifest([unlisted], sources)).navigation).toEqual([]);
  });
});

describe('resolveStory - a union of booleans and string literals', () => {
  it('is a select of true, false and the literals, generating a scenario for each but an unset false', () => {
    const checkbox = component({
      name: 'Checkbox',
      props: { checked: { type: "boolean | 'indeterminate'" } },
    });
    const story = resolveStory(checkbox, undefined, {});
    expect(story.propTypes.find((propType) => propType.name === 'checked')).toMatchObject({
      control: 'select',
      options: [undefined, true, false, 'indeterminate'],
      include: true,
    });
    expect(story.scenarios.map((scenario) => [scenario.id, scenario.props])).toEqual([
      ['checked', { checked: true }],
      ['checked-indeterminate', { checked: 'indeterminate' }],
    ]);
  });

  it('is no color select, as the tokens are strings', () => {
    const tinted = component({ props: { color: { type: "boolean | 'accent'" } } });
    const story = resolveStory(tinted, undefined, { colorTokens: [undefined, 'primary'] });
    expect(story.propTypes.find((propType) => propType.name === 'color')?.control).toBe('select');
  });
});

describe('resolveStory - a prop named color', () => {
  const tinted = component({
    props: {
      color: { type: "'blue' | 'red' | 'green'", default: 'blue' },
      borderColor: { type: 'string' },
    },
  });

  it('is a select of its declared union, with scenarios, when the kit gives no color tokens', () => {
    const story = resolveStory(tinted, undefined, {});
    const color = story.propTypes.find((propType) => propType.name === 'color');
    expect(color).toMatchObject({
      control: 'select',
      options: ['blue', 'red', 'green'],
    });
    expect(
      story.propTypes.find((propType) => propType.name === 'borderColor')
    ).toMatchObject({ control: 'text', include: true });
    expect(story.scenarios.map((scenario) => scenario.id)).toEqual([
      'color-red',
      'color-green',
    ]);
  });

  it('is the color select when the kit gives color tokens', () => {
    const story = resolveStory(tinted, undefined, {
      colorTokens: [undefined, 'primary', 'accent'],
    });
    for (const name of ['color', 'borderColor'])
      expect(
        story.propTypes.find((propType) => propType.name === name)?.control
      ).toBe('color-select');
  });
});

describe("the preview's own Empty scenario's id", () => {
  it("is not a generated scenario's: a boolean named empty turned on is 'empty-true'", () => {
    const story = resolveStory(
      component({ props: { empty: { type: 'boolean', default: false } } }),
      undefined,
      {}
    );
    const generated = story.scenarios.find((scenario) => scenario.generated);
    expect(generated).toMatchObject({ id: 'empty-true', label: 'empty', props: { empty: true } });
    const catalog = catalogFromManifest(buildManifest([story], []));
    const ids = catalog.components[0].scenarios.map((scenario) => scenario.id);
    expect(ids.filter((id) => id === 'empty')).toEqual(['empty']);
    expect(ids).toContain('empty-true');
  });

  it("is not a curated scenario's", () => {
    expect(() =>
      resolveStory(component(), { scenarios: [{ id: 'empty', props: { label: 'x' } }] }, {})
    ).toThrow("Button: scenario id 'empty' is the preview's own Empty scenario's; give the scenario another id");
  });
});

describe('bindingsOf', () => {
  it('lists the two-way props of both forms in prop order', () => {
    const bindings = bindingsOf(
      component({
        name: 'Select',
        template: {
          type: 'component',
          name: 'Select',
          props: {
            value: {
              type: 'string',
              bindable: { given: 'givenValue', report: 'reportValue', changeProp: 'onValueChange' },
            },
            onValueChange: { type: '(value: string) => void' },
            pressed: {
              type: 'boolean',
              bindable: { current: 'isPressed', setter: 'setPressed', defaultProp: 'defaultPressed' },
            },
            defaultPressed: { type: 'boolean', default: false },
            open: { type: 'boolean', bindable: { given: 'givenOpen', report: 'reportOpen' } },
          },
          extensions: { vue: { model: 'value' } },
          children: [{ type: 'element', tag: 'div' }],
        },
      })
    );
    expect(bindings).toEqual([
      { prop: 'value', changeProp: 'onValueChange', vueModel: true },
      { prop: 'pressed', defaultProp: 'defaultPressed' },
      { prop: 'open' },
    ]);
  });
});
