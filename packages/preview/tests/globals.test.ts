// @vitest-environment happy-dom
// The preview iframe's option apply (app/preview/globals.ts): at import it
// links the default theme, builds the kit's mount wrapper around `#app`,
// injects the canvas stylesheet and paints the option defaults; afterwards
// `applyGlobals` executes each option's declared effect - a root attribute,
// the theme stylesheet, a class, a CSS variable - on the document root, the
// body or a named wrapper node. Non-hash link clicks are made inert.
//
// The module runs its setup at import against the kit's `@preview-configuration`, so
// every scenario resets the document, mocks that module with its own config
// and imports a fresh copy.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OptionValue, PreviewOption } from '../src/options';
import type { PreviewBrowserConfiguration } from '../src/lib/types';

// Held in a variable so the workspace type-check does not follow the import
// into the app, whose `@preview-configuration` module only the app's own config maps.
const globalsModule = '../application/preview/globals';

type Globals = {
  applyGlobals: (options: Record<string, OptionValue> | undefined) => void;
};

/** The preview block's browser data, defaulting everything a scenario does not set. */
function configurationModule(
  overrides: Partial<PreviewBrowserConfiguration> = {}
): PreviewBrowserConfiguration {
  return {
    options: [],
    canvas: { namePrefix: 'acme' },
    themes: [],
    mount: undefined,
    viewCanvas: undefined,
    ...overrides,
  };
}

/** A global option applying `apply`: a boolean for a boolean default, else a
 *  choice offering its default. */
function option(
  id: string,
  apply: PreviewOption['apply'],
  defaultValue: OptionValue = ''
): PreviewOption {
  return {
    id,
    label: id,
    ...(typeof defaultValue === 'boolean'
      ? {}
      : { values: [{ value: defaultValue, label: defaultValue }] }),
    default: defaultValue,
    scope: 'global',
    apply,
  };
}

/** Import a fresh globals module against `configuration`. */
async function load(configuration: PreviewBrowserConfiguration): Promise<Globals> {
  vi.resetModules();
  vi.doMock('@preview-configuration', () => configuration);
  return (await import(/* @vite-ignore */ globalsModule)) as Globals;
}

const root = (): HTMLElement => document.documentElement;
const themeLink = (): HTMLLinkElement | null =>
  document.getElementById('acme-theme-css') as HTMLLinkElement | null;

beforeEach(() => {
  for (const name of root().getAttributeNames()) root().removeAttribute(name);
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="app"></div>';
  for (const name of document.body.getAttributeNames())
    document.body.removeAttribute(name);
  history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.doUnmock('@preview-configuration');
});

describe('globals - initialization', () => {
  it('links the first theme, injects the canvas stylesheet and paints the defaults', async () => {
    await load(
      configurationModule({
        canvas: {
          namePrefix: 'acme',
          pageBackground: 'ivory',
          extraCss: '.inset { padding: 1rem; }',
        },
        themes: [
          { id: 'light', label: 'Light', css: 'light.css' },
          { id: 'dark', label: 'Dark', css: 'dark.css' },
        ],
        options: [
          option(
            'density',
            { type: 'root-attribute', attribute: 'data-density' },
            'compact'
          ),
        ],
      })
    );
    expect(themeLink()?.getAttribute('href')).toBe('/themes/light/theme.css');
    expect(themeLink()?.rel).toBe('stylesheet');
    const canvas = document.getElementById('acme-preview-canvas');
    expect(canvas?.textContent).toContain('body { background: ivory; }');
    expect(canvas?.textContent).toContain('.inset { padding: 1rem; }');
    expect(root().getAttribute('data-density')).toBe('compact');
  });

  it('links no theme and paints no background when the kit declares neither', async () => {
    await load(configurationModule());
    expect(themeLink()).toBeNull();
    expect(document.getElementById('acme-preview-canvas')?.textContent).toBe(
      'html { overscroll-behavior: contain; }\nbody { min-height: 100vh; }'
    );
  });
});

describe('globals - applyGlobals', () => {
  it('sets a root attribute, and removes it for an empty or null value', async () => {
    const { applyGlobals } = await load(
      configurationModule({
        options: [
          option('density', { type: 'root-attribute', attribute: 'data-density' }),
          option('tone', {
            type: 'root-attribute',
            attribute: 'data-tone',
            target: 'body',
          }),
        ],
      })
    );
    applyGlobals({ density: 'roomy', tone: 'warm' });
    expect(root().getAttribute('data-density')).toBe('roomy');
    expect(document.body.getAttribute('data-tone')).toBe('warm');
    expect(root().hasAttribute('data-tone')).toBe(false);

    applyGlobals({ density: '' });
    expect(root().hasAttribute('data-density')).toBe(false);
    applyGlobals({ tone: null as unknown as OptionValue });
    expect(document.body.hasAttribute('data-tone')).toBe(false);

    // A toggle driving an attribute: true writes it, false removes it.
    applyGlobals({ density: true });
    expect(root().getAttribute('data-density')).toBe('true');
    applyGlobals({ density: false });
    expect(root().hasAttribute('data-density')).toBe(false);
  });

  it('leaves a root attribute off at the default value when the option omits it there', async () => {
    const { applyGlobals } = await load(
      configurationModule({
        options: [
          option(
            'mode',
            { type: 'root-attribute', attribute: 'data-mode', omitAtDefault: true },
            'dark'
          ),
          option('surface', { type: 'root-attribute', attribute: 'data-surface' }, '1'),
        ],
      })
    );
    applyGlobals({ mode: 'dark', surface: '1' });
    expect(root().hasAttribute('data-mode')).toBe(false);
    expect(root().getAttribute('data-surface')).toBe('1');

    applyGlobals({ mode: 'light' });
    expect(root().getAttribute('data-mode')).toBe('light');
    applyGlobals({ mode: 'dark' });
    expect(root().hasAttribute('data-mode')).toBe(false);
  });

  it('swaps the theme stylesheet, falling back to the default for an unknown theme', async () => {
    const { applyGlobals } = await load(
      configurationModule({
        themes: [
          { id: 'light', label: 'Light', css: 'light.css' },
          { id: 'dark', label: 'Dark', css: 'dark.css' },
        ],
        options: [option('theme', { type: 'stylesheet' }, 'light')],
      })
    );
    applyGlobals({ theme: 'dark' });
    expect(themeLink()?.getAttribute('href')).toBe('/themes/dark/theme.css');
    applyGlobals({ theme: '' });
    expect(themeLink()?.getAttribute('href')).toBe('/themes/dark/theme.css');
    applyGlobals({ theme: 'sepia' });
    expect(themeLink()?.getAttribute('href')).toBe('/themes/light/theme.css');
    expect(document.querySelectorAll('link').length).toBe(1);
  });

  it('toggles a named class, or records the value when the option names no class', async () => {
    const { applyGlobals } = await load(
      configurationModule({
        options: [
          option('outline', {
            type: 'class',
            on: 'body',
            className: 'is-outlined',
          }),
          option('grid', {
            type: 'class',
            target: 'root',
            className: 'has-grid',
          }),
          option('layout', { type: 'class' }),
        ],
      })
    );
    applyGlobals({ outline: true, grid: true, layout: 'stacked' });
    expect(document.body.classList.contains('is-outlined')).toBe(true);
    expect(root().classList.contains('has-grid')).toBe(true);
    expect(root().getAttribute('data-acme-preview-class')).toBe('stacked');

    applyGlobals({ outline: false, grid: false });
    expect(document.body.classList.contains('is-outlined')).toBe(false);
    expect(root().classList.contains('has-grid')).toBe(false);

    // A toggle on an option that names no class records true and clears on false.
    applyGlobals({ layout: true });
    expect(root().getAttribute('data-acme-preview-class')).toBe('true');
    applyGlobals({ layout: false });
    expect(root().hasAttribute('data-acme-preview-class')).toBe(false);
  });

  it('sets a CSS variable, and removes it for an empty value', async () => {
    const { applyGlobals } = await load(
      configurationModule({
        options: [
          option('gap', { type: 'css-var', var: '--gap' }),
          option('width', { type: 'css-var', var: '--width', target: 'body' }),
        ],
      })
    );
    applyGlobals({ gap: '2rem', width: '40ch' });
    expect(root().style.getPropertyValue('--gap')).toBe('2rem');
    expect(document.body.style.getPropertyValue('--width')).toBe('40ch');
    applyGlobals({ gap: '' });
    expect(root().style.getPropertyValue('--gap')).toBe('');
    applyGlobals({ width: false });
    expect(document.body.style.getPropertyValue('--width')).toBe('');
  });

  it('ignores unknown ids and a missing payload', async () => {
    const { applyGlobals } = await load(
      configurationModule({
        options: [
          option('density', { type: 'root-attribute', attribute: 'data-density' }),
        ],
      })
    );
    expect(() => applyGlobals({ unknown: 'value' })).not.toThrow();
    expect(() => applyGlobals(undefined)).not.toThrow();
    expect(root().hasAttribute('data-density')).toBe(false);
  });
});

describe('globals - the mount wrapper', () => {
  const previewMount: PreviewBrowserConfiguration['mount'] = {
    tag: 'main',
    classes: ['surface'],
    attributes: { 'data-surface': 'base' },
    style: 'display: grid',
    ref: 'surface',
    children: [{ ref: 'inset', classes: ['inset'], mount: true }],
  };
  const previewOptions = [
    option('padded', {
      type: 'class',
      target: { ref: 'inset' },
      className: 'is-padded',
    }),
    option('fill', {
      type: 'css-var',
      var: '--fill',
      target: { ref: 'surface' },
    }),
    option('missing', {
      type: 'root-attribute',
      attribute: 'data-missing',
      target: { ref: 'nowhere' },
    }),
  ];

  it('builds the declared tree where #app sat and moves #app into the mount node', async () => {
    const { applyGlobals } = await load(
      configurationModule({ mount: previewMount, options: previewOptions })
    );
    const wrapper = document.body.firstElementChild as HTMLElement;
    expect(wrapper.tagName).toBe('MAIN');
    expect(wrapper.hasAttribute('data-acme-preview-wrapper')).toBe(true);
    expect(wrapper.classList.contains('surface')).toBe(true);
    expect(wrapper.getAttribute('data-surface')).toBe('base');
    expect(wrapper.style.display).toBe('grid');
    const inset = wrapper.firstElementChild as HTMLElement;
    expect(inset.tagName).toBe('DIV');
    expect(document.getElementById('app')?.parentElement).toBe(inset);

    applyGlobals({ padded: true, fill: 'teal', missing: 'x' });
    expect(inset.classList.contains('is-padded')).toBe(true);
    expect(wrapper.style.getPropertyValue('--fill')).toBe('teal');
    // A ref the tree does not declare targets nothing.
    expect(document.querySelector('[data-missing]')).toBeNull();
  });

  it("paints a custom view with the kit's view canvas, not the component frame's", async () => {
    history.replaceState(null, '', '/?view=gallery');
    await load(
      configurationModule({
        canvas: { namePrefix: 'acme', pageBackground: 'black', extraCss: '.frame { padding: 1rem; }' },
        viewCanvas: { pageBackground: 'white', extraCss: '.gallery { gap: 1rem; }' },
      })
    );
    expect(document.getElementById('acme-preview-canvas')?.textContent).toBe(
      'html { overscroll-behavior: contain; }\nbody { min-height: 100vh; }\nbody { background: white; }\n.gallery { gap: 1rem; }'
    );
  });

  it('gives a custom view the page background alone when the kit declares no view canvas', async () => {
    history.replaceState(null, '', '/?view=gallery');
    await load(
      configurationModule({ canvas: { namePrefix: 'acme', pageBackground: 'black', extraCss: '.frame { padding: 1rem; }' } })
    );
    expect(document.getElementById('acme-preview-canvas')?.textContent).toBe(
      'html { overscroll-behavior: contain; }\nbody { min-height: 100vh; }\nbody { background: black; }'
    );
  });

  it('builds no wrapper in a custom-view iframe', async () => {
    history.replaceState(null, '', '/?view=gallery');
    const { applyGlobals } = await load(
      configurationModule({ mount: previewMount, options: previewOptions })
    );
    expect(document.querySelector('[data-acme-preview-wrapper]')).toBeNull();
    expect(document.getElementById('app')?.parentElement).toBe(document.body);
    expect(() => applyGlobals({ padded: true, fill: 'teal' })).not.toThrow();
  });

  it("gives the code iframe no wrapper and no story option, its mount filling the page's background", async () => {
    document.body.innerHTML = '<div id="app" data-preview-code></div>';
    const { applyGlobals } = await load(
      configurationModule({
        mount: previewMount,
        canvas: { namePrefix: 'acme', pageBackground: 'black', extraCss: '.inset { padding: 1rem; }' },
        options: [
          option('mode', { type: 'root-attribute', attribute: 'data-mode' }, 'light'),
          { ...option('box', { type: 'class', target: 'body', className: 'is-boxed' }, true), scope: 'story' },
        ],
      })
    );
    expect(document.querySelector('[data-acme-preview-wrapper]')).toBeNull();
    expect(document.getElementById('app')?.parentElement).toBe(document.body);
    expect(document.getElementById('acme-preview-canvas')?.textContent).toBe(
      'html { overscroll-behavior: contain; }\nhtml, body, #app { height: 100%; }\nbody { margin: 0; }\nbody { background: black; }'
    );
    // The global option's default applies; the story option's does not.
    expect(root().getAttribute('data-mode')).toBe('light');
    expect(document.body.classList.contains('is-boxed')).toBe(false);
    applyGlobals({ mode: 'dark', box: true });
    expect(root().getAttribute('data-mode')).toBe('dark');
    expect(document.body.classList.contains('is-boxed')).toBe(false);
  });

  it('leaves #app in the body when the kit declares no wrapper', async () => {
    await load(configurationModule());
    expect(document.getElementById('app')?.parentElement).toBe(document.body);
  });
});

describe('globals - links', () => {
  /** Click a fresh anchor and report whether its navigation was prevented. */
  function clickLink(href: string): boolean {
    const anchor = document.createElement('a');
    anchor.setAttribute('href', href);
    const label = document.createElement('span');
    anchor.appendChild(label);
    document.body.appendChild(anchor);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    label.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('makes a non-hash link inert and leaves hash links alone', async () => {
    await load(configurationModule());
    expect(clickLink('/elsewhere')).toBe(true);
    expect(clickLink('https://example.com')).toBe(true);
    expect(clickLink('#section')).toBe(false);
  });
});
