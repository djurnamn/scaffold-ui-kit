// A story's source as the controller holds it and the shell helper prints it:
// the target source printed in the browser from the catalog, which equals
// what `storySource` prints for the same story and scenario on every fixture
// kit, a Svelte runes build included; a controlled two-way story's prop bound
// to state of the source's own; the source following props, scenarios and
// the editor's tree; the html
// asked of the development server, debounced and dropped when the story
// changes; the html a static build printed per scenario, and unavailable for
// anything else.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadPreviewContext } from '../src/context';
import { generatePreview } from '../src/generate';
import { storySource } from '../src/story-source';
import {
  catalogFromManifest,
  createPreviewController,
  createStaticHtmlSourceLoader,
  REGENERATION_DEBOUNCE_MILLISECONDS,
  printStorySource,
  type CatalogManifest,
  type HtmlSourceRequest,
  type HtmlSourceResponse,
  type PreviewCatalog,
  type PreviewController,
  type PreviewControllerOptions,
} from '../src/controller';
import type { PreviewScriptedTarget } from '../src/protocol';
import { printSourceStory as printSourceStoryOf } from '../src/controller/source';
import { writeSourceKit } from './support/source-kit';

const here = dirname(fileURLToPath(import.meta.url));
const temporaryRoots: string[] = [];

/** A kit to print from, generated: its root and its catalog. */
interface GeneratedKit {
  kitRoot: string;
  catalog: PreviewCatalog;
}

async function generated(kitRoot: string): Promise<GeneratedKit> {
  const context = loadPreviewContext(kitRoot);
  await generatePreview(context);
  const manifest = JSON.parse(
    readFileSync(join(context.generatedRoot, 'manifest.json'), 'utf8')
  ) as CatalogManifest;
  return { kitRoot, catalog: catalogFromManifest(manifest) };
}

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(directory);
  return directory;
}

/** A copy of a committed fixture kit, so generation writes outside the repository. */
function copyOf(fixture: string): string {
  const kitRoot = temporaryDirectory('preview-source-fixture-');
  cpSync(fixture, kitRoot, { recursive: true });
  return kitRoot;
}

const kits: Record<string, GeneratedKit> = {};

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const sourceKit = temporaryDirectory('preview-source-kit-');
  writeSourceKit(sourceKit);
  kits.source = await generated(sourceKit);
  kits.browser = await generated(copyOf(resolve(here, 'browser/fixture-kit')));
  kits.generate = await generated(copyOf(resolve(here, 'fixtures/generate-kit')));
  // The fixture kit again, building its Svelte target in runes mode.
  const runesRoot = copyOf(resolve(here, 'browser/fixture-kit'));
  const configurationPath = join(runesRoot, 'scaffold-ui-kit.json');
  const configuration = JSON.parse(readFileSync(configurationPath, 'utf8'));
  writeFileSync(configurationPath, JSON.stringify({ ...configuration, svelte: { mode: 'runes' } }, null, 2));
  kits.runes = await generated(runesRoot);
}, 60_000);

afterAll(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots)
    rmSync(root, { recursive: true, force: true });
});

function controllerFor(
  kit: GeneratedKit,
  options: Partial<PreviewControllerOptions> = {}
): PreviewController {
  return createPreviewController({
    catalog: kit.catalog,
    options: [],
    ...options,
  });
}

describe("the browser's target source", () => {
  it.each(['source', 'browser', 'generate', 'runes'])(
    'equals what storySource prints for every story and scenario of the %s kit, in each target',
    async (name) => {
      const kit = kits[name];
      const controller = controllerFor(kit);
      let compared = 0;
      for (const component of kit.catalog.components.filter(
        (candidate) => candidate.standalone
      )) {
        const scenarios = [
          '',
          ...component.scenarios
            .filter((scenario) => !scenario.empty)
            .map((scenario) => scenario.id),
        ];
        for (const scenario of scenarios) {
          const printed = printStorySource(kit.catalog, {
            component: component.id,
            scenario,
          });
          controller.actions.selectComponent(component.id);
          controller.actions.pickScenario(scenario);
          const state = controller.getState().code!.targets;
          expect(Object.keys(printed)).toEqual(component.targets);
          for (const target of component.targets) {
            const expected = (
              await storySource(kit.kitRoot, component.name, {
                ...(scenario === '' ? {} : { scenario }),
                targets: [target],
              })
            )[target];
            expect(printed[target], `${component.name} ${scenario} ${target}`).toBe(expected);
            expect(state[target], `${component.name} ${scenario} ${target}`).toBe(expected);
            compared += 1;
          }
        }
      }
      expect(compared).toBeGreaterThan(5);
      controller.dispose();
    },
    60_000
  );

  it("leaves out a hint's value the story starts from, and prints it once the scenario or a person sets it", () => {
    const { catalog } = kits.source;
    const badge = catalog.components.find((component) => component.name === 'Badge')!;
    expect(badge.defaultProps.size).toBe(0.75);
    expect(badge.previewDefaults).toEqual({ size: 0.75 });
    expect(printStorySource(catalog, { component: badge.id }).react).toContain('return <Badge>new</Badge>;');
    expect(printStorySource(catalog, { component: badge.id, props: { size: 2 } }).react).toContain(
      'return <Badge size={2}>new</Badge>;'
    );
  });
});

describe("the controller's source", () => {
  it('is absent while a view is selected, and present for a story', () => {
    const kit = kits.browser;
    const controller = createPreviewController({
      catalog: catalogFromManifest(
        { ...JSON.parse(readFileSync(join(loadPreviewContext(kit.kitRoot).generatedRoot, 'manifest.json'), 'utf8')) },
        [{ id: 'swatches', label: 'Swatches', mount: () => undefined }]
      ),
      options: [],
    });
    expect(controller.getState().code?.targets.react).toContain("from 'fixture-kit/react'");
    controller.actions.selectView('swatches');
    expect(controller.getState().code).toBeUndefined();
    controller.actions.selectComponent('components-tag');
    expect(controller.getState().code?.targets.vue).toContain('<Tag>Active</Tag>');
  });

  it('follows setProps and pickScenario, and keeps its reference through an unrelated change', () => {
    const controller = controllerFor(kits.browser);
    controller.actions.selectComponent('components-tag');
    expect(controller.getState().code!.targets.react).toContain('return <Tag>Active</Tag>;');
    controller.actions.pickScenario('loud');
    expect(controller.getState().code!.targets.svelte).toContain('<Tag tone="loud">Active</Tag>');
    controller.actions.setProps({ ...controller.getState().props, tone: 'calm' });
    // The declared default is left out.
    expect(controller.getState().code!.targets.svelte).toContain('<Tag>Active</Tag>');
    controller.actions.setProps({ ...controller.getState().props, tone: 'loud' });
    const code = controller.getState().code;
    controller.actions.setTargetVisible('vue', false);
    expect(controller.getState().code).toBe(code);
    controller.dispose();
  });

  it("binds a controlled two-way story's prop to state of its own, as the kit builds Svelte, and asks its html at the value", () => {
    const timers = manualTimers();
    const requests: HtmlSourceRequest[] = [];
    const controller = controllerFor(kits.browser, {
      timers,
      htmlSource: async (request) => {
        requests.push(request);
        return { markup: '<button></button>\n' };
      },
    });
    controller.actions.selectComponent('components-toggle');
    const { react, vue, svelte } = controller.getState().code!.targets;
    expect(react).toContain('const [pressed, setPressed] = useState(false);');
    expect(react).toContain('<Toggle pressed={pressed} onPressedChange={setPressed} />');
    // The Toggle names `pressed` its Vue model.
    expect(vue).toContain('const pressed = ref(false);');
    expect(vue).toContain('<Toggle v-model="pressed" />');
    expect(kits.browser.catalog.svelteMode).toBe('legacy');
    expect(svelte).toContain('  let pressed = false;');
    expect(svelte).toContain('<Toggle bind:pressed />');
    timers.advance(REGENERATION_DEBOUNCE_MILLISECONDS);
    expect(requests).toEqual([{ rootComponent: 'Toggle', props: { pressed: false } }]);
    controller.dispose();

    expect(kits.runes.catalog.svelteMode).toBe('runes');
    expect(printStorySource(kits.runes.catalog, { component: 'components-toggle' }).svelte).toContain(
      '  let pressed = $state(false);'
    );
  });

  it("leaves out a controlled story's default prop and a prop it unsets with null, and types its state by the kit's exported type", () => {
    const printed = printStorySource(kits.source.catalog, { component: 'components-datefield', scenario: 'controlled' });
    expect(printed.react).toContain("import { DateField, type DateFieldValue } from 'kit/react';");
    expect(printed.react).toContain("const [value, setValue] = useState<DateFieldValue>({ day: '2' });");
    expect(printed.react).toContain('return <DateField value={value} onValueChange={setValue} />;');
    expect(printed.vue).toContain("import { DateField, type DateFieldValue } from 'kit/vue';");
    expect(printed.vue).toContain('<DateField v-model:value="value" />');
    expect(printed.svelte).toContain("let value: DateFieldValue = { day: '2' };");
    for (const source of Object.values(printed)) {
      expect(source).not.toContain('defaultValue');
      expect(source).not.toContain('null');
    }
    // Uncontrolled, the story keeps its default prop.
    expect(printStorySource(kits.source.catalog, { component: 'components-datefield', scenario: '' }).react).toContain(
      `<DateField label="date" defaultValue={{ day: '1' }} />`
    );
  });

  it("names a type by the bound component's own export first, and never by a component's name", () => {
    const catalog = {
      kitName: 'kit',
      sources: [],
      imports: {
        Calendar: { exportName: 'Calendar', modules: { react: 'kit/calendar' }, types: { react: ['DateValue'] } },
        DateField: { exportName: 'DateField', modules: { react: 'kit/date-field' }, types: { react: ['DateValue', 'DateField'] } },
      },
    } as unknown as Parameters<typeof printSourceStoryOf>[0];
    const binding = { prop: 'value', changeProp: 'onValueChange' };
    const print = (declaredType: string) =>
      printSourceStoryOf(catalog, {
        component: 'DateField',
        props: { value: { day: '1' } },
        named: {},
        bindings: [{ ...binding, declaredType }],
      }, ['react']).react!;
    const own = print('DateValue');
    expect(own).toContain("import { DateField, type DateValue } from 'kit/date-field';");
    expect(own).toContain('useState<DateValue>');
    expect(own).not.toContain('kit/calendar');
    // The component's own name is a value: the state falls back to its prop type.
    expect(print('DateField')).toContain("useState<ComponentProps<typeof DateField>['value']>");
  });

  it("prints the editor's tree as it is edited", () => {
    const controller = controllerFor(kits.browser, { regeneration: async () => undefined });
    controller.actions.selectComponent('components-tag');
    controller.editor.open();
    expect(controller.getState().code!.targets.react).toContain('return <Tag>Active</Tag>;');
    controller.editor.insert(
      { parent: [], slot: 'default' },
      controller.editor.createNode({ kind: 'component', name: 'Dot' })
    );
    const react = controller.getState().code!.targets.react!;
    expect(react).toContain("import { Tag, Dot } from 'fixture-kit/react';");
    expect(react).toContain(['    <Tag>', '      Active', '      <Dot />', '    </Tag>'].join('\n'));
    controller.editor.setText([{ slot: 'default', index: 0 }], 'Edited');
    // The text touches the component, so Vue prints them on one line, where
    // a line break would read as a space.
    expect(controller.getState().code!.targets.vue).toContain('    Edited<Dot />\n');
    controller.dispose();
  });
});

/** Timers the tests advance by hand. */
function manualTimers() {
  let now = 0;
  let pending: { at: number; callback: () => void; handle: number }[] = [];
  let next = 0;
  return {
    setTimeout(callback: () => void, milliseconds: number) {
      next += 1;
      pending.push({ at: now + milliseconds, callback, handle: next });
      return next;
    },
    clearTimeout(handle: unknown) {
      pending = pending.filter((timer) => timer.handle !== handle);
    },
    advance(milliseconds: number) {
      now += milliseconds;
      const due = pending.filter((timer) => timer.at <= now);
      pending = pending.filter((timer) => timer.at > now);
      for (const timer of due) timer.callback();
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the controller's html source", () => {
  it('asks the server once changes pause, and lands its answer', async () => {
    const timers = manualTimers();
    const requests: HtmlSourceRequest[] = [];
    const controller = controllerFor(kits.browser, {
      timers,
      htmlSource: async (request) => {
        requests.push(request);
        return { markup: `<span>${String(request.props.tone ?? 'calm')}</span>\n` };
      },
    });
    controller.actions.selectComponent('components-tag');
    expect(controller.getState().code!.html).toEqual({ status: 'loading' });
    controller.actions.setProps({ ...controller.getState().props, tone: 'loud' });
    timers.advance(REGENERATION_DEBOUNCE_MILLISECONDS - 1);
    expect(requests).toEqual([]);
    timers.advance(1);
    expect(requests).toEqual([
      { rootComponent: 'Tag', props: { tone: 'loud' }, slots: { default: { kind: 'text', value: 'Active' } } },
    ]);
    await settle();
    expect(controller.getState().code!.html).toEqual({ status: 'ready', source: '<span>loud</span>\n' });
    controller.dispose();
  });

  it('drops a request for a story the selection has left, and aborts it', async () => {
    const timers = manualTimers();
    const signals: AbortSignal[] = [];
    let answer: ((response: HtmlSourceResponse) => void) | undefined;
    const controller = controllerFor(kits.browser, {
      timers,
      htmlSource: (request, signal) => {
        signals.push(signal);
        return new Promise((resolve) => {
          answer = resolve;
        });
      },
    });
    controller.actions.selectComponent('components-tag');
    timers.advance(REGENERATION_DEBOUNCE_MILLISECONDS);
    expect(signals).toHaveLength(1);
    controller.actions.selectComponent('components-button');
    expect(signals[0].aborted).toBe(true);
    answer!({ markup: '<span>stale</span>\n' });
    await settle();
    expect(controller.getState().code!.html).toEqual({ status: 'loading' });
    controller.dispose();
  });

  it('reports a story with no markup, and a request that fails, as unavailable with the reason', async () => {
    const timers = manualTimers();
    let fail = false;
    const controller = controllerFor(kits.browser, {
      timers,
      htmlSource: async () => {
        if (fail) throw new Error('the kit did not load');
        return { missing: ['TimerDriver, a component with no template'] };
      },
    });
    controller.actions.selectComponent('components-tag');
    timers.advance(REGENERATION_DEBOUNCE_MILLISECONDS);
    await settle();
    expect(controller.getState().code!.html).toEqual({
      status: 'unavailable',
      reason: 'This story has no html: it holds TimerDriver, a component with no template.',
    });
    fail = true;
    controller.actions.pickScenario('loud');
    timers.advance(REGENERATION_DEBOUNCE_MILLISECONDS);
    await settle();
    expect(controller.getState().code!.html).toEqual({ status: 'unavailable', reason: 'the kit did not load' });
    controller.dispose();
  });

  it('is unavailable in a controller with no way to print it', () => {
    const controller = controllerFor(kits.browser);
    expect(controller.getState().code!.html).toEqual({
      status: 'unavailable',
      reason: 'This preview has no way to print html.',
    });
  });

  it("reads a static build's scenario html, and is unavailable for changed props", async () => {
    const kitRoot = copyOf(resolve(here, 'browser/fixture-kit'));
    const context = loadPreviewContext(kitRoot);
    await generatePreview(context, { htmlSources: true });
    const manifest = JSON.parse(readFileSync(join(context.generatedRoot, 'manifest.json'), 'utf8')) as CatalogManifest;
    const fetched: string[] = [];
    // The static build's files, served from where the build puts them.
    const loader = createStaticHtmlSourceLoader('https://example.com/kit/', async (url) => {
      fetched.push(String(url));
      const path = String(url).replace('https://example.com/kit/', '');
      return new Response(readFileSync(join(context.generatedRoot, 'public', path), 'utf8'));
    });
    const controller = createPreviewController({
      catalog: catalogFromManifest(manifest),
      options: [],
      scenarioHtmlSources: loader,
    });
    controller.actions.selectComponent('components-tag');
    await settle();
    expect(controller.getState().code!.html).toEqual({
      status: 'ready',
      source: '<span class="FixtureTag" data-tone="calm">Active</span>\n',
    });
    controller.actions.pickScenario('loud');
    await settle();
    expect(controller.getState().code!.html).toEqual({
      status: 'ready',
      source: '<span class="FixtureTag" data-tone="loud">Active</span>\n',
    });
    // One file per component, read once: the first story's on creation, then Tag's.
    expect(fetched).toEqual([
      'https://example.com/kit/html-source/components-button.json',
      'https://example.com/kit/html-source/components-tag.json',
    ]);
    controller.actions.setProps({ ...controller.getState().props, tone: 'calm' });
    expect(controller.getState().code!.html).toEqual({
      status: 'unavailable',
      reason:
        'The static build prints html for the scenarios alone: there is none for changed props or edited content.',
    });
    // Back to the scenario's props, its html again.
    controller.actions.setProps({ ...controller.getState().props, tone: 'loud' });
    await settle();
    expect(controller.getState().code!.html).toMatchObject({ status: 'ready' });
    controller.dispose();
  });
});

describe('printStorySource', () => {
  it("prints a story reference's target source: a scenario, props over it, and the Empty scenario without content", () => {
    const { catalog } = kits.browser;
    const targets: PreviewScriptedTarget[] = ['react', 'vue', 'svelte'];
    const iconLabel = printStorySource(catalog, { component: 'components-iconlabel', scenario: 'icon-only' });
    expect(Object.keys(iconLabel)).toEqual(targets);
    expect(iconLabel.react).toContain('<IconLabel label="" icon={<Dot />} />');
    const props = printStorySource(catalog, { component: 'components-iconlabel', props: { label: 'Hello' } });
    expect(props.svelte).toContain('<IconLabel label="Hello">');
    const empty = printStorySource(catalog, { component: 'components-tag', scenario: 'empty' });
    expect(empty.react).toContain('return <Tag />;');
  });

  it('refuses an unknown component or scenario', () => {
    const { catalog } = kits.browser;
    expect(() => printStorySource(catalog, { component: 'nope' })).toThrow(/no component "nope"/);
    expect(() => printStorySource(catalog, { component: 'components-tag', scenario: 'nope' })).toThrow(
      /no scenario "nope"/
    );
  });
});

describe('a story with content beside its component', () => {
  it('prints the hint the field names after it in every target and the html, and mounts it in each registry', async () => {
    const kit = kits.browser;
    const printed = printStorySource(kit.catalog, { component: 'components-field', scenario: '' });
    expect(printed.react).toContain('    <>\n      <Field');
    expect(printed.react).toContain(
      '      />\n      <p id="field-hint" className="FixtureFieldHint">\n        Type to mark the field.\n      </p>\n    </>\n  );',
    );
    for (const target of ['vue', 'svelte'] as const)
      expect(printed[target]).toContain('<p id="field-hint" class="FixtureFieldHint">Type to mark the field.</p>');
    const { html } = await storySource(kit.kitRoot, 'Field', { targets: ['html'] });
    expect(html).toMatch(/aria-describedby="field-hint"[^]*\n<p class="FixtureFieldHint" id="field-hint">Type to mark the field\.<\/p>\n$/);
    const { generatedRoot } = loadPreviewContext(kit.kitRoot);
    expect(readFileSync(join(generatedRoot, 'react', 'registry.tsx'), 'utf8')).toContain('<p id={"field-hint"} className={"FixtureFieldHint"}>');
    expect(readFileSync(join(generatedRoot, 'vue', 'registry.ts'), 'utf8')).toContain(`<p :id='\\"field-hint\\"'`);
  });
});
