// @vitest-environment happy-dom
// Where the controller keeps what a person chose (src/controller/persistence.ts
// and the controller around it): the host page's query parameters - read as a
// deep link when the controller starts, rewritten in place on each change,
// junk ignored - and, with `url-and-local-storage`, the global option values
// in local storage per kit name, a value in the URL winning over a stored one.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import manifest from './fixtures/host/manifest.json';
import { options as previewOptions } from './fixtures/host/preview-configuration';
import { views } from './fixtures/host/views';
import {
  acceptsPropValue,
  catalogFromManifest,
  changedProps,
  createPreviewController,
  parseTargets,
  parseOptionValue,
  parsePaneWidth,
  parseProps,
  readUrlState,
  storageKey,
  writeUrlState,
  type CatalogManifest,
  type PreviewController,
  type PreviewControllerOptions,
  type PreviewStorage,
} from '../src/controller';

const BUTTON = 'components-button';
const CARD = 'components-layout-card';
const STORAGE_KEY = storageKey('acme');

const catalog = catalogFromManifest(manifest as CatalogManifest, views);
const controllers: PreviewController[] = [];

function create(options: Partial<PreviewControllerOptions> = {}): PreviewController {
  const controller = createPreviewController({ catalog, options: previewOptions, regeneration: async () => {}, ...options });
  controllers.push(controller);
  return controller;
}

/** Open the page at `search`, as a followed link would. */
function visit(search: string): void {
  window.history.replaceState(null, '', `/${search}`);
}

const search = (): string => window.location.search;

beforeEach(() => {
  visit('');
  window.localStorage.clear();
});

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});

describe('the query parameters', () => {
  it('reads and writes the selection, the scenario and option values, keeping foreign parameters', () => {
    expect(readUrlState('?component=a&scenario=b&option.mode=true&option.theme=dark&other=1')).toEqual({
      component: 'a',
      view: undefined,
      scenario: 'b',
      props: undefined,
      targets: undefined,
      options: { mode: 'true', theme: 'dark' },
    });
    expect(
      writeUrlState('other=1&component=old&option.stale=x', {
        selection: { kind: 'view', id: 'gallery' },
        options: { mode: true },
      }),
    ).toBe('other=1&view=gallery&option.mode=true');
  });

  it('writes the props as JSON and the targets as a list, a comma and a colon unescaped', () => {
    const search = writeUrlState('props=old&targets=vue', {
      selection: { kind: 'component', id: 'a' },
      props: { tone: 'primary', size: 2 },
      targets: ['react', 'svelte'],
      options: {},
    });
    expect(search).toBe('component=a&props=%7B%22tone%22:%22primary%22,%22size%22:2%7D&targets=react,svelte');
    expect(readUrlState(search)).toMatchObject({ props: '{"tone":"primary","size":2}', targets: 'react,svelte' });
  });

  it('reads the targets among the kit\'s, an empty list as none and a list of strangers as nothing', () => {
    expect(parseTargets('svelte,react', ['react', 'vue', 'svelte'])).toEqual(['react', 'svelte']);
    expect(parseTargets('vue,angular', ['react', 'vue'])).toEqual(['vue']);
    expect(parseTargets('', ['react', 'vue'])).toEqual([]);
    expect(parseTargets('svelte', ['react', 'vue'])).toBeUndefined();
  });

  it('writes the pane width as a number of pixels and reads back only a whole number above zero', () => {
    const search = writeUrlState('width=1', {
      selection: { kind: 'component', id: 'a' },
      width: 768,
      options: {},
    });
    expect(search).toBe('component=a&width=768');
    expect(readUrlState(search).width).toBe('768');
    expect(parsePaneWidth('768')).toBe(768);
    expect(parsePaneWidth('7680')).toBe(7680);
    for (const junk of ['0', '-375', '375.5', '1e3', 'wide', '', '7681', '99999999'])
      expect(parsePaneWidth(junk)).toBeUndefined();
  });

  it("accepts a prop value its control can hold", () => {
    const colors = [null, 'primary'];
    expect(acceptsPropValue({ control: 'boolean' }, true, colors)).toBe(true);
    expect(acceptsPropValue({ control: 'boolean' }, 'true', colors)).toBe(false);
    expect(acceptsPropValue({ control: 'number' }, 2, colors)).toBe(true);
    expect(acceptsPropValue({ control: 'number' }, '2', colors)).toBe(false);
    expect(acceptsPropValue({ control: 'select', options: ['a', undefined] }, 'a', colors)).toBe(true);
    expect(acceptsPropValue({ control: 'select', options: ['a'] }, 'b', colors)).toBe(false);
    expect(acceptsPropValue({ control: 'select', options: [true, false, 'mixed'] }, false, colors)).toBe(true);
    expect(acceptsPropValue({ control: 'select', options: [true, 'mixed'] }, false, colors)).toBe(false);
    expect(acceptsPropValue({ control: 'select', options: [true, 'mixed'] }, 'true', colors)).toBe(false);
    expect(acceptsPropValue({ control: 'color-select' }, 'primary', colors)).toBe(true);
    expect(acceptsPropValue({ control: 'color-select' }, 'pink', colors)).toBe(false);
    expect(acceptsPropValue({ control: 'text' }, 'Hi', colors)).toBe(true);
    expect(acceptsPropValue({ control: 'text' }, { html: 1 }, colors)).toBe(false);
  });

  it('reads the props a component declares with values it accepts, a refused value falling back to the scenario\'s', () => {
    const propTypes = [
      { name: 'elevated', control: 'boolean' as const },
      { name: 'tone', control: 'color-select' as const },
    ];
    const fallback = { elevated: true, children: 'unused' };
    expect(parseProps('{"elevated":false,"tone":"accent","stray":1}', propTypes, {}, fallback, ['accent'])).toEqual({
      elevated: false,
      tone: 'accent',
    });
    expect(parseProps('{"elevated":"no","tone":"pink"}', propTypes, {}, fallback, ['accent'])).toEqual({ elevated: true });
    expect(parseProps('not json', propTypes, {}, fallback, [])).toBeUndefined();
    expect(parseProps('[1]', propTypes, {}, fallback, [])).toBeUndefined();
  });

  it('round-trips a select of booleans and strings through the address', () => {
    const propTypes = [{ name: 'checked', control: 'select' as const, options: [undefined, true, false, 'indeterminate'] }];
    for (const checked of [true, false, 'indeterminate']) {
      const search = writeUrlState('', { selection: { kind: 'component', id: 'a' }, props: { checked }, options: {} });
      expect(parseProps(readUrlState(search).props!, propTypes, {}, {}, [])).toEqual({ checked });
    }
    expect(parseProps('{"checked":"true"}', propTypes, {}, { checked: 'indeterminate' }, [])).toEqual({
      checked: 'indeterminate',
    });
  });

  it('fills a prop the parameter leaves out from the defaults, and leaves out a prop set to null', () => {
    const propTypes = [
      { name: 'elevated', control: 'boolean' as const },
      { name: 'tone', control: 'color-select' as const },
      { name: 'label', control: 'text' as const },
    ];
    const defaults = { elevated: false, label: 'Card', shadow: 'soft' };
    expect(parseProps('{"tone":"accent"}', propTypes, defaults, {}, ['accent'])).toEqual({
      elevated: false,
      label: 'Card',
      shadow: 'soft',
      tone: 'accent',
    });
    expect(parseProps('{"label":null,"tone":null}', propTypes, defaults, {}, ['accent'])).toEqual({
      elevated: false,
      shadow: 'soft',
    });
    // A refused value with no scenario value keeps the default.
    expect(parseProps('{"elevated":"yes"}', propTypes, defaults, {}, [])).toMatchObject({ elevated: false });
  });

  it('keeps a null the scenario or the defaults hold, and leaves out any other', () => {
    const propTypes = [{ name: 'tone', control: 'color-select' as const }];
    expect(parseProps('{"tone":null}', propTypes, { tone: null }, { tone: null }, ['accent'])).toEqual({ tone: null });
    expect(parseProps('{"tone":null}', propTypes, { tone: 'accent' }, { tone: 'accent' }, ['accent'])).toEqual({});
  });

  it('names the props that differ from a base, and those of the base left out as null', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(
      changedProps({ selected: 'b', items: [{ id: 'a' }, { id: 'b' }], gone: undefined }, { selected: 'a', items, icon: 'plus', gone: 'x', hidden: 1 }, (name) => name !== 'hidden'),
    ).toEqual({ selected: 'b', icon: null, gone: null });
    expect(changedProps({ items }, { items }, () => true)).toEqual({});
  });

  it('keeps a default with no control that the parameter leaves out', () => {
    const propTypes = [{ name: 'striped', control: 'boolean' as const }];
    const rows = [{ id: 1, name: 'One' }];
    expect(parseProps('{"striped":true}', propTypes, { rows, striped: false }, {}, [])).toEqual({ rows, striped: true });
    // A prop with no control is not the address's to set or to leave out.
    expect(parseProps('{"rows":null}', propTypes, { rows }, {}, [])).toEqual({ rows });
  });

  it("parses a value only an option can hold", () => {
    const [theme, mode] = previewOptions;
    expect(parseOptionValue(theme, 'dark')).toBe('dark');
    expect(parseOptionValue(theme, 'sepia')).toBeUndefined();
    expect(parseOptionValue(mode, 'true')).toBe(true);
    expect(parseOptionValue(mode, 'false')).toBe(false);
    expect(parseOptionValue(mode, 'yes')).toBeUndefined();
  });
});

describe('createPreviewController - the URL', () => {
  it('leaves the address alone on load, and writes it on the first action without adding a history entry', () => {
    const length = window.history.length;
    const controller = create();
    expect(search()).toBe('');
    controller.actions.setOption('theme', 'dark');
    expect(search()).toBe(`?component=${BUTTON}&option.theme=dark`);
    expect(window.history.length).toBe(length);
  });

  it('opens a deep link: the story, its scenario, global and story options', () => {
    visit(`?component=${CARD}&scenario=toned&option.theme=dark&option.mode=true&option.padded=false`);
    const state = create().getState();
    expect(state.selection).toEqual({ kind: 'component', id: CARD });
    expect(state.scenario).toBe('toned');
    expect(state.options).toEqual({ theme: 'dark', mode: true, box: true, padded: false });
    expect(search()).toBe(`?component=${CARD}&scenario=toned&option.theme=dark&option.mode=true&option.padded=false`);
  });

  it('opens a view', () => {
    visit('?view=gallery&option.theme=dark');
    const state = create().getState();
    expect(state.selection).toEqual({ kind: 'view', id: 'gallery' });
    expect(state.options.theme).toBe('dark');
  });

  it('ignores what it cannot use, and drops it from the URL', () => {
    visit(
      `?component=nope&scenario=nope&option.theme=sepia&option.mode=maybe&option.nope=1&option.box=false&keep=me`,
    );
    const controller = create();
    const state = controller.getState();
    expect(state.selection).toEqual({ kind: 'component', id: BUTTON });
    expect(state.scenario).toBe('');
    expect(state.options).toEqual({ theme: 'light', mode: false, box: true, padded: false });
    // The address is left as it was opened until the first action rewrites it.
    expect(search()).toContain('option.nope=1');
    controller.actions.setOption('mode', false);
    expect(search()).toBe(`?keep=me&component=${BUTTON}`);
  });

  it('ignores a component that is not standalone, an unknown scenario, and a story option the story marks unavailable', () => {
    visit('?component=components-layout-tab');
    expect(create().getState().selection.id).toBe(BUTTON);
    visit(`?component=${CARD}&scenario=nope&option.box=true`);
    const controller = create();
    const state = controller.getState();
    expect(state.scenario).toBe('raised');
    expect(state.options.box).toBe(true);
    controller.actions.setOption('mode', false);
    expect(search()).toBe(`?component=${CARD}`);
  });

  it('opens Empty only where the story can be regenerated', () => {
    visit(`?component=${BUTTON}&scenario=empty`);
    expect(create().getState().scenario).toBe('empty');
    visit(`?component=${BUTTON}&scenario=empty`);
    const without = create({ regeneration: undefined }).getState();
    expect(without.scenario).toBe('');
    expect(without.regeneration).toEqual({ status: 'idle' });
  });

  it('rewrites the URL on each change, keeping only what differs from the defaults', () => {
    const controller = create();
    controller.actions.selectComponent(CARD);
    expect(search()).toBe(`?component=${CARD}`);
    controller.actions.pickScenario('toned');
    controller.actions.setOption('mode', true);
    controller.actions.setOption('padded', false);
    expect(search()).toBe(`?component=${CARD}&scenario=toned&option.mode=true&option.padded=false`);
    controller.actions.setOption('mode', false);
    controller.actions.pickScenario('raised');
    expect(search()).toBe(`?component=${CARD}&option.padded=false`);
  });

  it('keeps a story option only while its story is selected', () => {
    const controller = create();
    controller.actions.selectComponent(CARD);
    controller.actions.setOption('padded', false);
    controller.actions.setOption('theme', 'dark');
    controller.actions.selectComponent(BUTTON);
    expect(search()).toBe(`?component=${BUTTON}&option.theme=dark`);
    controller.actions.selectView('gallery');
    expect(search()).toBe('?view=gallery&option.theme=dark');
  });
});

describe('createPreviewController - props and targets in the URL', () => {
  const propsIn = (): unknown => {
    const raw = new URLSearchParams(search()).get('props');
    return raw === null ? undefined : JSON.parse(raw);
  };

  it("writes a view's selectComponent props as the story's, over its default scenario", () => {
    const controller = create();
    controller.actions.selectView('gallery');
    controller.actions.selectComponent(BUTTON, { variant: 'ghost' });
    expect(propsIn()).toEqual({ variant: 'ghost' });
    controllers.pop()!.dispose();
    expect(create().getState().props).toEqual({ variant: 'ghost', children: 'Click' });
  });

  it("writes only the props that differ from the scenario's, and reads them back over it", () => {
    const controller = create();
    controller.actions.selectComponent(CARD);
    controller.actions.pickScenario('toned');
    controller.actions.setProps({ ...controller.getState().props, elevated: true });
    expect(propsIn()).toEqual({ elevated: true });
    controllers.pop()!.dispose();
    const reopened = create();
    expect(reopened.getState().props).toEqual({ elevated: true, children: 'unused', tone: 'accent' });
    // A prop of the scenario's the story leaves out is written as null.
    const { tone: _tone, ...withoutTone } = reopened.getState().props;
    reopened.actions.setProps(withoutTone);
    expect(propsIn()).toEqual({ elevated: true, tone: null });
    controllers.pop()!.dispose();
    expect(create().getState().props).toEqual({ elevated: true, children: 'unused' });
  });

  it("leaves a story's data out of the address when only another prop changes", () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({ id: index, name: `Row ${index} with a longer description` }));
    const withRows = JSON.parse(JSON.stringify(manifest)) as CatalogManifest;
    const button = withRows.components.find((component) => component.id === BUTTON)!;
    button.defaultProps = { ...button.defaultProps, rows };
    const controller = create({ catalog: catalogFromManifest(withRows, views) });
    controller.actions.setProps({ ...controller.getState().props, variant: 'ghost' });
    expect(propsIn()).toEqual({ variant: 'ghost' });
    controller.actions.setProps({ ...controller.getState().props, variant: 'solid' });
    expect(propsIn()).toBeUndefined();
  });

  it('reads the props back over the scenario, keeping the children of a default slot', () => {
    visit(`?component=${CARD}&scenario=&props=${encodeURIComponent('{"tone":"primary","children":"Body","elevated":"x","nope":1}')}`);
    const state = create().getState();
    expect(state.scenario).toBe('');
    // `elevated` is refused and keeps the scenario's value; `nope` is not Card's.
    expect(state.props).toEqual({ tone: 'primary', children: 'Body', elevated: false });
  });

  it("opens a link that leaves out a default prop on the story's default", () => {
    visit(`?component=${BUTTON}&props=${encodeURIComponent('{"variant":"ghost"}')}`);
    expect(create().getState().props).toEqual({ variant: 'ghost', children: 'Click' });
  });

  it('writes a default prop the story leaves out as null, and reads it back left out', () => {
    const controller = create();
    controller.actions.setProps({ variant: 'ghost' });
    expect(propsIn()).toEqual({ variant: 'ghost', children: null });
    controllers.pop()!.dispose();
    expect(create().getState().props).toEqual({ variant: 'ghost' });
  });

  it('opens Empty with props, its content staying out of the tree', () => {
    visit(`?component=${BUTTON}&scenario=empty&props=${encodeURIComponent('{"variant":"ghost"}')}`);
    const state = create().getState();
    expect(state.scenario).toBe('empty');
    expect(state.props).toEqual({ variant: 'ghost' });
    expect(state.editor.tree?.slots).toEqual({});
  });

  it("keeps a story's default that no control sets when a link leaves it out", () => {
    const rows = [{ id: 1, name: 'One' }];
    const withRows = JSON.parse(JSON.stringify(manifest)) as CatalogManifest;
    const button = withRows.components.find((component) => component.id === BUTTON)!;
    button.defaultProps = { ...button.defaultProps, rows };
    visit(`?component=${BUTTON}&props=${encodeURIComponent('{"variant":"ghost"}')}`);
    const controller = create({ catalog: catalogFromManifest(withRows, views) });
    expect(controller.getState().props).toEqual({ variant: 'ghost', children: 'Click', rows });
  });

  it('ignores props that are not an object, and props of a view', () => {
    visit(`?component=${CARD}&props=oops`);
    expect(create().getState().props).toEqual({ elevated: true, children: 'unused' });
    visit(`?view=gallery&props=${encodeURIComponent('{"variant":"ghost"}')}`);
    expect(create().getState().props).toEqual({ variant: 'solid', children: 'Click' });
  });

  it('reads the visible targets back, ignoring a list of strangers', () => {
    visit('?targets=svelte');
    expect(create().getState().targets.panes).toEqual(['svelte']);
    visit('?targets=angular');
    expect(create().getState().targets.panes).toEqual(['react', 'vue', 'svelte']);
    visit('?targets=');
    expect(create().getState().targets.panes).toEqual([]);
  });
});

describe('createPreviewController - the pane width in the URL', () => {
  it('writes the width while the panes are not fitted, and drops it once they are again', () => {
    const controller = create();
    controller.actions.setPaneWidth(1280);
    expect(search()).toBe(`?component=${BUTTON}&width=1280`);
    controller.actions.selectComponent(CARD);
    expect(search()).toBe(`?component=${CARD}&width=1280`);
    controller.actions.setPaneWidth(undefined);
    expect(search()).toBe(`?component=${CARD}`);
  });

  it('reads the width back, ignoring one that is not a whole number above zero', () => {
    visit(`?component=${CARD}&width=768`);
    expect(create().getState().paneWidth).toBe(768);
    visit(`?component=${CARD}&width=wide`);
    expect(create().getState().paneWidth).toBeUndefined();
  });

  it('keeps the address of a page only opened, its width among it', () => {
    visit('?width=375');
    expect(create().getState().paneWidth).toBe(375);
    expect(search()).toBe('?width=375');
  });

  it('stays out of storage', () => {
    create({ persistence: 'url-and-local-storage' }).actions.setPaneWidth(375);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('createPreviewController - local storage', () => {
  it('stays out of storage by default', () => {
    create().actions.setOption('theme', 'dark');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('remembers the changed global values per kit, and forgets one set back to its default', () => {
    const controller = create({ persistence: 'url-and-local-storage' });
    controller.actions.setOption('theme', 'dark');
    controller.actions.setOption('mode', true);
    controller.actions.selectComponent(CARD);
    controller.actions.setOption('padded', false);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({ theme: 'dark', mode: true });
    controller.actions.setOption('mode', false);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({ theme: 'dark' });
    controller.actions.setOption('theme', 'light');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('starts from the stored values, the URL winning, and the selection never stored', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', mode: true, box: false, nope: 1 }));
    visit('?option.mode=false');
    const controller = create({ persistence: 'url-and-local-storage' });
    const state = controller.getState();
    expect(state.selection.id).toBe(BUTTON);
    expect(state.options).toEqual({ theme: 'dark', mode: false, box: true, padded: false });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({ theme: 'dark' });
    // The address waits for an action; storage is kept up to date regardless.
    expect(search()).toBe('?option.mode=false');
    controller.actions.setOption('padded', true);
    expect(search()).toBe(`?component=${BUTTON}&option.theme=dark&option.padded=true`);
  });

  it('ignores storage it cannot read or write, and stored junk', () => {
    const refusing: PreviewStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const controller = create({ persistence: 'url-and-local-storage', storage: refusing });
    expect(() => controller.actions.setOption('theme', 'dark')).not.toThrow();
    expect(controller.getState().options.theme).toBe('dark');

    visit('');
    window.localStorage.setItem(STORAGE_KEY, 'not json');
    expect(create({ persistence: 'url-and-local-storage' }).getState().options.theme).toBe('light');
    visit('');
    window.localStorage.setItem(STORAGE_KEY, '["dark"]');
    expect(create({ persistence: 'url-and-local-storage' }).getState().options.theme).toBe('light');
  });

  it('works on a window whose local storage throws on access', () => {
    const hostWindow = {
      addEventListener: () => {},
      removeEventListener: () => {},
      get localStorage(): Storage {
        throw new Error('SecurityError');
      },
    };
    const controller = create({ persistence: 'url-and-local-storage', window: hostWindow as unknown as Window });
    expect(() => controller.actions.setOption('theme', 'dark')).not.toThrow();
  });
});
