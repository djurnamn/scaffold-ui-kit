// @vitest-environment happy-dom
// The charcell shell's configuration (application/shells/charcell): a fill
// for each named slot mounts in its region, written in plain DOM or in React,
// and `groups` moves an option group to another region. The shell is loaded
// the way the host page loads it, with the configured shell swapped in for
// `@preview-shell`. The deep-link scroll of the navigation is checked too.

import { act, createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CharcellShellConfiguration,
  CharcellSlotFill,
} from '../application/shells/charcell/configuration';
import { optionPlacement } from '../application/shells/charcell/placement';
import { usePreview } from '../src/react';
import type { PreviewController, PreviewShell } from '../src/shell';
import { installPreviewEnvironment, type PreviewEnvironment } from './support/preview-environment';

// Held in variables so the workspace type-check does not follow the imports
// into the app's .tsx modules, which only the app's own config compiles.
const mainModule = '../application/host/main';
const shellModule = '../application/shells/charcell/index';

const { charcellShell, reactFill } = (await import(/* @vite-ignore */ shellModule)) as {
  charcellShell: (configuration?: CharcellShellConfiguration) => PreviewShell;
  reactFill: (render: (controller: PreviewController) => ReactNode) => CharcellSlotFill;
};

let environment: PreviewEnvironment | undefined;
let unmount: (() => void) | undefined;
let controller: PreviewController | undefined;
let mounting: Promise<void> | undefined;

// Loading the host takes most of a test's time, and many times longer while
// the machine is busy with builds.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Loads the host page's entry with the configured shell. The mount is held
 * so the cleanup can wait for it: a test that runs out of time leaves it
 * running, and it would otherwise finish inside the next test.
 */
function mountHost(configuration: CharcellShellConfiguration, url = '/'): Promise<void> {
  mounting = loadHost(configuration, url);
  return mounting;
}

async function loadHost(configuration: CharcellShellConfiguration, url: string): Promise<void> {
  environment = installPreviewEnvironment();
  window.history.replaceState(null, '', url);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetModules();
  vi.doMock('@preview-configuration', () => import('./fixtures/host/preview-configuration'));
  vi.doMock('@preview-shell', () => ({ default: charcellShell(configuration) }));
  document.body.innerHTML = '<div id="root"></div>';
  await act(async () => {
    const entry = (await import(/* @vite-ignore */ mainModule)) as {
      controller: PreviewController;
      unmount: () => void;
    };
    controller = entry.controller;
    unmount = entry.unmount;
  });
}

/** The region an element sits in: by the landmarks around it. */
function regionOf(element: Element | null): 'top bar' | 'stage' | 'status bar' | undefined {
  if (!element) return undefined;
  const navigation = document.querySelector('nav')!;
  const stage = document.querySelector('main')!;
  if (stage.contains(element)) return 'stage';
  const following = (other: Element) => Boolean(other.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
  if (!following(navigation)) return 'top bar';
  return following(stage) ? 'status bar' : undefined;
}

function labelOf(text: string): Element | undefined {
  return [...document.querySelectorAll('label, span')].find(
    (candidate) => candidate.textContent === text && candidate.nextElementSibling !== null,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(async () => {
  await mounting?.catch(() => undefined);
  mounting = undefined;
  await act(async () => {
    unmount?.();
  });
  unmount = undefined;
  controller?.dispose();
  controller = undefined;
  document.body.innerHTML = '';
  vi.doUnmock('@preview-configuration');
  vi.doUnmock('@preview-shell');
  await environment?.restore();
  environment = undefined;
});

describe('charcell shell - slots', () => {
  it('mounts a DOM fill in the status bar and a React fill in the top bar, and unmounts them with the shell', async () => {
    const unmountBadge = vi.fn();
    await mountHost({
      slots: {
        'status-bar': (element, given) => {
          const badge = element.ownerDocument.createElement('output');
          badge.textContent = `badge for ${given.catalog.kitName}`;
          element.appendChild(badge);
          return unmountBadge;
        },
        'top-bar-end': reactFill((given: PreviewController) => {
          const selection = usePreview(given, (state) => state.selection);
          return createElement('mark', null, `showing ${selection.id}`);
        }),
        'stage-bar-end': (element) => {
          element.textContent = 'stage fill';
        },
      },
    });

    expect(regionOf(document.querySelector('output'))).toBe('status bar');
    expect(document.querySelector('output')?.textContent).toBe('badge for acme');
    expect(regionOf(document.querySelector('mark'))).toBe('top bar');
    expect(document.querySelector('mark')?.textContent).toBe('showing components-button');
    expect(regionOf(document.querySelector('[data-preview-slot="stage-bar-end"]'))).toBe('stage');

    // A React fill follows the controller's state.
    await act(async () => {
      controller!.actions.selectComponent('components-layout-card');
    });
    expect(document.querySelector('mark')?.textContent).toBe('showing components-layout-card');

    await act(async () => {
      unmount!();
    });
    expect(unmountBadge).toHaveBeenCalledTimes(1);
    expect(document.querySelector('mark')).toBeNull();
  });

  it('renders no outlet for a slot with no fill', async () => {
    await mountHost({});
    expect(document.querySelector('[data-preview-slot]')).toBeNull();
  });
});

describe('charcell shell - the component picker', () => {
  it("is as wide as its longest entry, never narrower than charcell's field, and titled with the selected entry", async () => {
    await mountHost({});
    const input = () => document.querySelector<HTMLInputElement>('[data-testid="select-component"]')!;
    expect(input().title).toBe('Button');
    // Every entry is shorter than 20 cells: the field keeps charcell's width, its text 20 cells and 4 beside it.
    expect((input().closest('[style*="width"]') as HTMLElement).style.width).toBe('24ch');
    await act(async () => {
      controller!.actions.selectComponent('components-layout-card');
    });
    expect(input().title).toBe('Layout/Card');
  });
});

describe('charcell shell - groups', () => {
  it('places an option group where the mapping says, over the shell’s own placement', async () => {
    await mountHost({ groups: { canvas: 'top-bar', kit: 'status-bar' } }, '/?option.shell.scenario=true');
    expect(regionOf(labelOf('mode') ?? null)).toBe('top bar');
    expect(regionOf(labelOf('theme') ?? null)).toBe('status bar');
    // Story options keep their place in the output view's options popover: they declare no group.
    const trigger = [...document.querySelectorAll('button')].find((button) => button.textContent === 'options…')!;
    await act(async () => (trigger as HTMLElement).click());
    expect(labelOf('box')?.closest('[role="dialog"][aria-label="output options"]')).not.toBeNull();
  });

  it("lays a view's options in its heading row or in a popover, as the shell's popovers say, beside the view's slot", async () => {
    await mountHost(
      {
        popovers: { output: false, code: true },
        groups: { canvas: 'code' },
        slots: {
          'output-end': (element) => {
            element.textContent = 'output fill';
          },
        },
      },
      '/?option.shell.code=true',
    );
    // The output's options sit in its heading row, beside its slot: no popover.
    expect(regionOf(labelOf('box') ?? null)).toBe('stage');
    expect(document.querySelector('[data-preview-slot="output-end"]')?.textContent).toBe('output fill');
    // The code's, a group the mapping places there, are in a popover.
    const triggers = [...document.querySelectorAll('button')].filter((button) => button.textContent === 'options…');
    expect(triggers).toHaveLength(1);
    expect(labelOf('mode')).toBeUndefined();
    await act(async () => (triggers[0] as HTMLElement).click());
    expect(labelOf('mode')?.closest('[role="dialog"][aria-label="code options"]')).not.toBeNull();
  });

  it('decides placement by scope and group, the mapping winning', () => {
    expect(optionPlacement({ scope: 'global' })).toBe('output');
    expect(optionPlacement({ scope: 'global', group: 'context' })).toBe('output');
    expect(optionPlacement({ scope: 'global', group: 'kit' })).toBe('top-bar');
    expect(optionPlacement({ scope: 'global', group: 'canvas' })).toBe('status-bar');
    expect(optionPlacement({ scope: 'story' })).toBe('output');
    expect(optionPlacement({ scope: 'story', group: 'frame' })).toBe('output');
    expect(optionPlacement({ scope: 'global', group: 'canvas' }, { canvas: 'stage-bar' })).toBe('stage-bar');
    expect(optionPlacement({ scope: 'global', group: 'kit' }, { kit: 'status-bar' })).toBe('status-bar');
    // Mapping the context group moves every option that names no group.
    expect(optionPlacement({ scope: 'global' }, { context: 'top-bar' })).toBe('top-bar');
    expect(optionPlacement({ scope: 'story' }, { context: 'status-bar' })).toBe('status-bar');
    expect(optionPlacement({ scope: 'story' }, { kit: 'status-bar' })).toBe('output');
    // A view's region takes a group too.
    expect(optionPlacement({ scope: 'global', group: 'canvas' }, { canvas: 'code' })).toBe('code');
    expect(optionPlacement({ scope: 'story', group: 'frame' }, { frame: 'status-bar' })).toBe('status-bar');
  });
});

describe('charcell shell - the page title', () => {
  it('names what the preview shows and the kit, following the selection', async () => {
    await mountHost({});
    expect(document.title).toBe('Button · acme preview');
    await act(async () => {
      controller!.actions.selectComponent('components-layout-card');
    });
    expect(document.title).toBe('Layout/Card · acme preview');
  });
});

describe('charcell shell - the navigation', () => {
  it('keeps its collapsed groups while it is hidden and shown', async () => {
    await mountHost({});
    const group = () =>
      [...document.querySelectorAll('nav [aria-expanded]')].find((summary) => summary.textContent?.includes('Layout'));
    expect(group()?.getAttribute('aria-expanded')).toBe('true');
    await act(async () => (group() as HTMLElement).click());
    expect(group()?.getAttribute('aria-expanded')).toBe('false');
    await act(async () => controller!.actions.setOption('shell.navigation', false));
    expect(document.querySelector('nav')).toBeNull();
    await act(async () => controller!.actions.setOption('shell.navigation', true));
    expect(group()?.getAttribute('aria-expanded')).toBe('false');
  });
});
