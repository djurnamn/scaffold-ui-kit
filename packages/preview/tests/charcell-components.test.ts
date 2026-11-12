// @vitest-environment happy-dom
// Two of the charcell shell's components on their own, over a controller
// standing in for the preview's: a prop's select control offering booleans
// beside strings (`boolean | 'indeterminate'`), each read back as the value
// it stands for, the html pane's note saying why it has no html, drawn
// by the shell over the pane, and its warning count, opening on a click.

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewController, PreviewPropType, PreviewState } from '../src/shell';

// Held in variables so the workspace type-check does not follow the imports
// into the app's .tsx modules, which only the app's own config compiles.
const contextModule = '../application/shells/charcell/controller-context';
const controlModule = '../application/shells/charcell/components/Control/index';
const paneModule = '../application/shells/charcell/components/PreviewPane/index';
const selectModule = '../application/shells/charcell/components/Select/index';
const viewControlsModule = '../application/shells/charcell/components/ViewControls/index';
const paneWidthModule = '../application/shells/charcell/components/PaneWidth/index';

// The first test transforms the shell's modules on import, which takes past
// the default timeout when the whole workspace tests at once.
vi.setConfig({ testTimeout: 30_000 });

/** A controller holding `state`, its frames mounting nothing. */
function fakeController(state: Partial<PreviewState>): PreviewController {
  return {
    catalog: { colorTokens: [] },
    getState: () => state as PreviewState,
    subscribe: () => () => undefined,
    frames: {
      mount: () => () => undefined,
      mountView: () => () => undefined,
      reload: () => undefined,
      standaloneUrl: () => '',
    },
  } as unknown as PreviewController;
}

let root: Root | undefined;
let container: HTMLElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  vi.doUnmock(selectModule);
  vi.resetModules();
});

async function render(controller: PreviewController, element: () => ReactNode | Promise<ReactNode>): Promise<void> {
  const shown = await element();
  const { PreviewControllerContext } = (await import(/* @vite-ignore */ contextModule)) as {
    PreviewControllerContext: React.Context<PreviewController | null>;
  };
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(PreviewControllerContext.Provider, { value: controller }, shown));
  });
}

describe('a select control of booleans and strings', () => {
  it('offers each value as its text and reads a choice back as the value', async () => {
    let given: { value: string; options: { value: string; label: string }[]; onChange?: (value: string) => void } | undefined;
    vi.doMock(selectModule, () => ({
      Select: (props: NonNullable<typeof given>) => {
        given = props;
        return null;
      },
    }));
    const { Control } = (await import(/* @vite-ignore */ controlModule)) as {
      Control: (props: { propType: PreviewPropType; value: unknown; onChange: (value: unknown) => void }) => ReactNode;
    };
    const onChange = vi.fn();
    const propType = {
      name: 'checked',
      control: 'select',
      options: [undefined, true, false, 'indeterminate'],
      include: true,
      declaredType: "boolean | 'indeterminate'",
      required: false,
    } as PreviewPropType;
    await render(fakeController({}), () => createElement(Control, { propType, value: false, onChange }));

    expect(given!.value).toBe('false');
    expect(given!.options).toEqual([
      { value: '', label: '(unset)' },
      { value: 'true', label: 'true' },
      { value: 'false', label: 'false' },
      { value: 'indeterminate', label: 'indeterminate' },
    ]);
    given!.onChange!('true');
    given!.onChange!('indeterminate');
    given!.onChange!('');
    expect(onChange.mock.calls).toEqual([[true], ['indeterminate'], [undefined]]);
  });
});

describe('the html pane', () => {
  const pane = (target: string) => async () => {
    const { PreviewPane } = (await import(/* @vite-ignore */ paneModule)) as {
      PreviewPane: (props: { title: string; target: string }) => ReactNode;
    };
    return createElement(PreviewPane, { title: target, target });
  };

  it('says why it has no html over the pane, in the shell', async () => {
    const reason = 'The static build prints html for the scenarios alone: there is none for changed props or edited content.';
    await render(
      fakeController({ frameSizes: {}, code: { targets: {}, html: { status: 'unavailable', reason } } } as Partial<PreviewState>),
      pane('html'),
    );
    const note = container.querySelector('.PreviewPane > [data-preview-html-note]');
    expect(note?.textContent).toBe(reason);
    expect(note?.getAttribute('role')).toBe('status');
  });

  it('draws no note while it has html, or over a target pane', async () => {
    await render(
      fakeController({ frameSizes: {}, code: { targets: {}, html: { status: 'ready', source: '<p></p>' } } } as Partial<PreviewState>),
      pane('html'),
    );
    expect(container.querySelector('[data-preview-html-note]')).toBeNull();
    await act(async () => root?.unmount());
    root = undefined;
    await render(
      fakeController({ frameSizes: {}, code: { targets: {}, html: { status: 'unavailable', reason: 'none' } } } as Partial<PreviewState>),
      pane('react'),
    );
    expect(container.querySelector('[data-preview-html-note]')).toBeNull();
  });
});

describe("the html pane's warnings", () => {
  const pane = (target: string) => async () => {
    const { PreviewPane } = (await import(/* @vite-ignore */ paneModule)) as {
      PreviewPane: (props: { title: string; target: string }) => ReactNode;
    };
    return createElement(PreviewPane, { title: target, target });
  };
  const warnings = ['DropdownMenuContent: could not evaluate isOpen (isOpen is not defined)'];
  const ready = { frameSizes: {}, code: { targets: {}, html: { status: 'ready', source: '<button>Open</button>', warnings } } } as Partial<PreviewState>;

  it('says in its legend how many warnings its markup has, where a part left out at rest would read as not shown', async () => {
    await render(fakeController(ready), pane('html'));
    const count = container.querySelector('[data-preview-html-warnings]');
    expect(count?.textContent).toBe('1 warning');
    expect(count?.tagName).toBe('BUTTON');
  });

  it('opens the warnings in a popover on a click, where they stay to be read and copied', async () => {
    await render(fakeController(ready), pane('html'));
    expect(document.body.textContent).not.toContain('could not evaluate isOpen');
    const count = container.querySelector<HTMLButtonElement>('[data-preview-html-warnings]');
    await act(async () => count!.click());
    expect(document.body.textContent).toContain('DropdownMenuContent: could not evaluate isOpen (isOpen is not defined)');
    expect(count?.getAttribute('aria-expanded')).toBe('true');
  });

  it('says nothing while the markup leaves nothing out, or over a target pane', async () => {
    await render(
      fakeController({ frameSizes: {}, code: { targets: {}, html: { status: 'ready', source: '<p></p>' } } } as Partial<PreviewState>),
      pane('html'),
    );
    expect(container.querySelector('[data-preview-html-warnings]')).toBeNull();
    await act(async () => root?.unmount());
    root = undefined;
    await render(fakeController(ready), pane('react'));
    expect(container.querySelector('[data-preview-html-warnings]')).toBeNull();
  });
});

describe("the output's options", () => {
  it('holds the width alone in its popover for a kit with no output options', async () => {
    const controller = {
      ...fakeController({ options: {}, unavailableOptions: [] } as Partial<PreviewState>),
      options: [],
      catalog: { colorTokens: [], paneWidths: [{ label: 'small', width: 375 }] },
    } as unknown as PreviewController;
    await render(controller, async () => {
      const { ViewControls } = (await import(/* @vite-ignore */ viewControlsModule)) as {
        ViewControls: (props: { view: string; options?: ReactNode }) => ReactNode;
      };
      const { PaneWidth } = (await import(/* @vite-ignore */ paneWidthModule)) as { PaneWidth: () => ReactNode };
      return createElement(ViewControls, { view: 'output', options: createElement(PaneWidth) });
    });
    const trigger = [...container.querySelectorAll('button')].find((button) => button.textContent === 'options\u2026');
    expect(trigger).toBeDefined();
    await act(async () => trigger!.click());
    const panel = document.querySelector('.ViewControls__options');
    expect(panel?.querySelector('[data-testid="select-pane-width"]')).not.toBeNull();
    // The width alone: no other control in the panel.
    expect(panel?.querySelectorAll('button').length).toBe(1);
  });

  it('shows no popover without kit options or widths', async () => {
    const controller = {
      ...fakeController({ options: {}, unavailableOptions: [] } as Partial<PreviewState>),
      options: [],
      catalog: { colorTokens: [], paneWidths: [] },
    } as unknown as PreviewController;
    await render(controller, async () => {
      const { ViewControls } = (await import(/* @vite-ignore */ viewControlsModule)) as {
        ViewControls: (props: { view: string; options?: ReactNode }) => ReactNode;
      };
      return createElement(ViewControls, { view: 'output' });
    });
    expect(container.querySelector('button')).toBeNull();
  });
});

const optionControlsModule = '../application/shells/charcell/components/OptionControls/index';
const wrapToggleModule = '../application/shells/charcell/components/WrapToggle/index';
const hintModule = '../application/shells/charcell/components/Hint/index';
const promptBarModule = '../application/shells/charcell/components/PromptBar/index';
const keyHintsModule = '../application/shells/charcell/components/KeyHints/index';
const navigationModule = '../application/shells/charcell/components/Navigation/index';
const paneStatusModule = '../application/shells/charcell/components/PaneStatus/index';
const codePaneModule = '../application/shells/charcell/components/CodePane/index';
const charcellModule = 'charcell/react/unlinked';

/** The accessible name a control's `aria-labelledby` gives it, or its own. */
function nameOf(control: Element): string | undefined {
  const labeledBy = control.getAttribute('aria-labelledby');
  if (!labeledBy) return undefined;
  return labeledBy
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

/** Lets a hint's open delay pass. */
const afterOpenDelay = () => act(() => new Promise((resolve) => setTimeout(resolve, 600)));

describe('a boolean toggle', () => {
  it("is named by its option's label, its own text saying only on or off", async () => {
    const controller = {
      ...fakeController({ options: { padded: false }, unavailableOptions: [] } as Partial<PreviewState>),
      options: [{ id: 'padded', label: 'padded', scope: 'story', origin: 'kit' }],
      actions: { setOption: vi.fn() },
    } as unknown as PreviewController;
    await render(controller, async () => {
      const { OptionControls } = (await import(/* @vite-ignore */ optionControlsModule)) as {
        OptionControls: (props: { placement: string }) => ReactNode;
      };
      return createElement(OptionControls, { placement: 'output' });
    });
    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    expect(nameOf(checkbox!)).toBe('padded');
  });

  it("is named by its prop's name in the editor", async () => {
    const { Control } = (await import(/* @vite-ignore */ controlModule)) as {
      Control: (props: { propType: PreviewPropType; value: unknown; onChange: (value: unknown) => void }) => ReactNode;
    };
    const propType = { name: 'disabled', control: 'boolean', include: true, required: false } as PreviewPropType;
    await render(fakeController({}), () => createElement(Control, { propType, value: true, onChange: () => undefined }));
    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(nameOf(checkbox!)).toBe('disabled');
  });

  it("keeps the name its hint's trigger, so the prop's description opens beside it", async () => {
    // charcell's Tooltip, recording the trigger id each hint hands it: the
    // id the tooltip finds its control by and places itself beside.
    const triggerIds: unknown[] = [];
    vi.doMock(charcellModule, async (importOriginal) => {
      const original = (await importOriginal()) as Record<string, unknown> & {
        Tooltip: (props: Record<string, unknown>) => ReactNode;
      };
      return {
        ...original,
        Tooltip: (props: Record<string, unknown>) => {
          triggerIds.push(props.triggerId);
          return original.Tooltip(props);
        },
      };
    });
    const { Control } = (await import(/* @vite-ignore */ controlModule)) as {
      Control: (props: { propType: PreviewPropType; value: unknown; onChange: (value: unknown) => void }) => ReactNode;
    };
    for (const control of ['boolean', 'text'] as const) {
      triggerIds.length = 0;
      const propType = {
        name: 'disabled',
        control,
        include: true,
        required: false,
        description: 'Turns the button off',
      } as PreviewPropType;
      await render(fakeController({}), () => createElement(Control, { propType, value: true, onChange: () => undefined }));
      const name = container.querySelector('.Control__label')!;
      expect(name.id).toMatch(/-label$/);
      expect(triggerIds.at(-1)).toBe(name.id);
      if (control === 'boolean') expect(nameOf(container.querySelector('input[type="checkbox"]')!)).toBe('disabled');
      else expect(name.getAttribute('for')).toBe(container.querySelector('input')!.id);
      await act(async () => {
        name.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
      });
      await afterOpenDelay();
      expect(document.body.textContent).toContain('Turns the button off');
      await act(async () => root?.unmount());
      root = undefined;
    }
    vi.doUnmock(charcellModule);
  });
});

describe("a toggle's hint", () => {
  it('opens as the pointer moves over the toggle the reader sees, and is the checkbox’s description', async () => {
    const controller = {
      ...fakeController({ options: {} } as Partial<PreviewState>),
      actions: { setOption: vi.fn() },
    } as unknown as PreviewController;
    await render(controller, async () => {
      const { WrapToggle } = (await import(/* @vite-ignore */ wrapToggleModule)) as { WrapToggle: () => ReactNode };
      return createElement(WrapToggle);
    });
    const toggle = container.querySelector('.CharcellToggle')!;
    await act(async () => {
      toggle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
      toggle.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    });
    await afterOpenDelay();
    expect(document.body.textContent).toContain('wrap long lines in every code pane');
    const describedBy = container.querySelector('input[type="checkbox"]')!.getAttribute('aria-describedby');
    expect(describedBy && document.getElementById(describedBy)?.textContent).toContain('wrap long lines');
  });

  it('takes the focus in place of a disabled toggle, so the keyboard reaches it', async () => {
    const { Hint } = (await import(/* @vite-ignore */ hintModule)) as {
      Hint: (props: {
        text?: string;
        around?: boolean;
        focusable?: boolean;
        children: (props: Record<string, unknown>) => ReactNode;
      }) => ReactNode;
    };
    const { Toggle } = (await import(/* @vite-ignore */ charcellModule)) as {
      Toggle: (props: Record<string, unknown>) => ReactNode;
    };
    await render(fakeController({}), () =>
      createElement(Hint, {
        text: 'not supported by this component',
        around: true,
        focusable: true,
        children: (hint) => createElement(Toggle, { ...hint, label: 'vue', disabled: true }),
      }),
    );
    const wrapper = container.querySelector('.Hint');
    expect(wrapper?.getAttribute('tabindex')).toBe('0');
    // Named by the hint's text, with no label given.
    expect(wrapper?.getAttribute('role')).toBe('group');
    expect(wrapper?.getAttribute('aria-label')).toBe('not supported by this component');
    expect(wrapper?.contains(container.querySelector('input:disabled'))).toBe(true);
    await act(async () => {
      wrapper!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
    });
    await afterOpenDelay();
    expect(document.body.textContent).toContain('not supported by this component');
  });
});

describe('a narrow window', () => {
  const originalMatchMedia = globalThis.matchMedia;
  afterEach(() => {
    globalThis.matchMedia = originalMatchMedia;
  });

  it('shows one view and one target without changing an option or a target, so the address stays as it is', async () => {
    globalThis.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof matchMedia;
    const setOption = vi.fn();
    const setTargetVisible = vi.fn();
    const state = {
      options: { 'shell.code': true },
      unavailableOptions: [],
      targets: { supported: ['react', 'vue'], visible: ['react', 'vue'], panes: ['react', 'vue'] },
    } as unknown as Partial<PreviewState>;
    const controller = {
      ...fakeController(state),
      options: [],
      catalog: { colorTokens: [], kitName: 'kit', targets: ['react', 'vue'] },
      actions: { setOption, setTargetVisible },
    } as unknown as PreviewController;
    await render(controller, async () => {
      const { PromptBar } = (await import(/* @vite-ignore */ promptBarModule)) as { PromptBar: () => ReactNode };
      return createElement(PromptBar);
    });
    expect(setOption).not.toHaveBeenCalled();
    expect(setTargetVisible).not.toHaveBeenCalled();
    const pressed = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
      .filter((input) => input.checked)
      .map((input) => input.closest('label')?.textContent);
    expect(pressed).toEqual(['navigation', 'output', 'react']);
  });
});

describe("the shell's keys", () => {
  async function keyed() {
    const setOption = vi.fn();
    const controller = {
      ...fakeController({ options: {} } as Partial<PreviewState>),
      catalog: { colorTokens: [], targets: ['react'] },
      actions: { setOption },
    } as unknown as PreviewController;
    await render(controller, async () => {
      const { KeyHints } = (await import(/* @vite-ignore */ keyHintsModule)) as { KeyHints: () => ReactNode };
      return createElement(KeyHints);
    });
    return setOption;
  }

  it('act with the focus on the page', async () => {
    const setOption = await keyed();
    await act(async () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true })));
    expect(setOption).toHaveBeenCalledOnce();
  });

  it("leave a letter to the navigation's tree, whose rows it finds, even where no row starts with it", async () => {
    const setOption = await keyed();
    const tree = document.createElement('div');
    tree.setAttribute('role', 'tree');
    const row = document.createElement('div');
    row.setAttribute('role', 'treeitem');
    tree.appendChild(row);
    container.appendChild(tree);
    await act(async () => row.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true })));
    expect(setOption).not.toHaveBeenCalled();
  });
});

describe('the navigation', () => {
  it('draws its groups collapsed as its parent keeps them, so hiding and showing it keeps them', async () => {
    const controller = {
      ...fakeController({ selection: { kind: 'component', id: 'button' } } as Partial<PreviewState>),
      catalog: {
        colorTokens: [],
        navigation: [
          {
            kind: 'group',
            key: 'forms',
            label: 'Forms',
            children: [{ kind: 'component', id: 'button', label: 'Button', title: 'Button' }],
          },
        ],
      },
    } as unknown as PreviewController;
    await render(controller, async () => {
      const { Navigation } = (await import(/* @vite-ignore */ navigationModule)) as {
        Navigation: (props: { collapsed: ReadonlySet<string>; onCollapsedChange: () => void }) => ReactNode;
      };
      return createElement(Navigation, { collapsed: new Set(['forms']), onCollapsedChange: () => undefined });
    });
    expect(container.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false');
  });
});

describe("the status bar's word", () => {
  it('takes the focus while messages stand behind it, so the keyboard opens them', async () => {
    const failed = {
      regeneration: { status: 'error', message: 'Button.story.ts: unknown prop' },
      frames: {},
      frameErrors: {},
    } as unknown as Partial<PreviewState>;
    await render(fakeController(failed), async () => {
      const { PaneStatus } = (await import(/* @vite-ignore */ paneStatusModule)) as { PaneStatus: () => ReactNode };
      return createElement(PaneStatus);
    });
    expect(container.querySelector('[role="status"]')?.getAttribute('tabindex')).toBe('0');
  });

  it('takes no focus with nothing behind it', async () => {
    const ready = { regeneration: { status: 'idle' }, frames: {}, frameErrors: {} } as unknown as Partial<PreviewState>;
    await render(fakeController(ready), async () => {
      const { PaneStatus } = (await import(/* @vite-ignore */ paneStatusModule)) as { PaneStatus: () => ReactNode };
      return createElement(PaneStatus);
    });
    expect(container.querySelector('[role="status"]')?.hasAttribute('tabindex')).toBe(false);
  });
});

describe("a code pane's line count", () => {
  it('sits outside the live region, which an edit would otherwise have announce it', async () => {
    const shown = { code: { targets: { react: '<Button />\n<Button />\n' }, html: { status: 'loading' } }, options: {} };
    await render(fakeController(shown as unknown as Partial<PreviewState>), async () => {
      const { CodePane } = (await import(/* @vite-ignore */ codePaneModule)) as {
        CodePane: (props: { target: string }) => ReactNode;
      };
      return createElement(CodePane, { target: 'react' });
    });
    expect(container.querySelector('.CodePane__note')?.textContent).toBe('2 lines');
    expect(container.querySelector('.CodePane__note [role="status"]')?.textContent).toBe('');
  });
});

describe("a target's toggle", () => {
  it('stays the one element as the selection makes its target unsupported, so a focused toggle keeps the focus', async () => {
    let state = {
      options: {},
      unavailableOptions: [],
      targets: { supported: ['react', 'vue'], visible: ['react', 'vue'], panes: ['react', 'vue'] },
    } as unknown as PreviewState;
    const listeners = new Set<() => void>();
    const controller = {
      ...fakeController({}),
      getState: () => state,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      options: [],
      catalog: { colorTokens: [], kitName: 'kit', targets: ['react', 'vue'] },
      actions: { setOption: vi.fn(), setTargetVisible: vi.fn() },
    } as unknown as PreviewController;
    await render(controller, async () => {
      const { PromptBar } = (await import(/* @vite-ignore */ promptBarModule)) as { PromptBar: () => ReactNode };
      return createElement(PromptBar);
    });
    const vue = () =>
      [...container.querySelectorAll('input[type="checkbox"]')].find((input) => input.closest('label')?.textContent === 'vue');
    const before = vue();
    await act(async () => {
      state = { ...state, targets: { supported: ['react'], visible: ['react', 'vue'], panes: ['react'] } } as PreviewState;
      for (const listener of listeners) listener();
    });
    expect(vue()).toBe(before);
    expect((vue() as HTMLInputElement).disabled).toBe(true);
    expect(vue()!.closest('.Hint')?.getAttribute('tabindex')).toBe('0');
    // The stop is a group named by the target it stands for.
    expect(vue()!.closest('.Hint')?.getAttribute('role')).toBe('group');
    expect(vue()!.closest('.Hint')?.getAttribute('aria-label')).toBe('vue');
  });
});

const previewGridModule = '../application/shells/charcell/components/PreviewGrid/index';

describe('the stage grid', () => {
  /** Renders the grid over charcell's own driver, its props and the
   *  splits' resets recorded. */
  async function renderGrid(code: boolean, { resettable = true } = {}) {
    const given: Record<string, unknown>[] = [];
    const resets = { columns: 0, rows: 0 };
    vi.doMock(charcellModule, async (importOriginal) => {
      const original = (await importOriginal()) as Record<string, unknown> & {
        SplitGridDriver: (props: Record<string, unknown>) => ReactNode;
      };
      return {
        ...original,
        SplitGridDriver: (props: Record<string, unknown> & { children: (scope: { grid: Record<string, unknown> }) => ReactNode }) => {
          given.push(props);
          return original.SplitGridDriver({
            ...props,
            children: ({ grid }: { grid: Record<string, unknown> }) =>
              props.children({
                grid: {
                  ...grid,
                  columnsApi: resettable
                    ? { ...(grid.columnsApi as object), resetSizes: () => resets.columns++ }
                    : withoutReset(grid.columnsApi),
                  rowsApi: resettable
                    ? { ...(grid.rowsApi as object), resetSizes: () => resets.rows++ }
                    : withoutReset(grid.rowsApi),
                },
              }),
          });
        },
      };
    });
    const state = {
      options: {},
      unavailableOptions: [],
      frameSizes: {},
      code: { targets: {}, html: { status: 'loading' } },
    } as unknown as Partial<PreviewState>;
    await render({ ...fakeController(state), options: [], catalog: { colorTokens: [], paneWidths: [] } } as unknown as PreviewController, async () => {
      const { PreviewGrid } = (await import(/* @vite-ignore */ previewGridModule)) as {
        PreviewGrid: (props: { targets: string[]; output: boolean; code: boolean }) => ReactNode;
      };
      return createElement(PreviewGrid, { targets: ['react', 'vue', 'svelte'], output: true, code });
    });
    vi.doUnmock(charcellModule);
    return { given, resets };
  }

  /** A split's api as a charcell with no reset hands it. */
  function withoutReset(api: unknown): Record<string, unknown> {
    const { resetSizes: _resetSizes, ...rest } = api as Record<string, unknown>;
    return rest;
  }

  const handle = (label: string) => container.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!;

  it('shares a leaving target’s width among the others in proportion', async () => {
    const { given } = await renderGrid(false);
    expect(given.at(-1)?.redistribute).toBe('proportional');
  });

  it('puts a column split back on a double-click or Enter on its handle', async () => {
    const { resets } = await renderGrid(false);
    const between = handle('resize react and vue');
    await act(async () => between.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    await act(async () => between.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(resets).toEqual({ columns: 2, rows: 0 });
  });

  it('puts the rows back on a double-click on the handle between the panes and the code', async () => {
    const { resets } = await renderGrid(true);
    await act(async () => handle('resize panes and code').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(resets).toEqual({ columns: 0, rows: 1 });
  });

  it('leaves a split as it is on a charcell whose split has no reset', async () => {
    await renderGrid(true, { resettable: false });
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      await act(async () => handle('resize react and vue').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
      await act(async () => handle('resize panes and code').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    } catch (error) {
      errors.push(error);
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(errors).toEqual([]);
  });
});
