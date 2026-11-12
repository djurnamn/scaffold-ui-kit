// @vitest-environment happy-dom
// The page side of the content-size report (src/protocol.ts): what an iframe
// measures and when it posts. The browser tests (tests/browser) prove the
// measurement against real layout; here the layout is stubbed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  announcePreviewShown,
  contentSizeMessage,
  measureContentSize,
  readContentSize,
  readPreviewMessage,
  reportContentSize,
  componentFrameUrl,
  markupMessage,
  PREVIEW_TARGETS,
  setStoryMessage,
  withEventRecorders,
  withWriteBacks,
  PendingWriteBacks,
  propsMessage,
} from '../src/protocol';

/** Give `element` a border box of `width` by `height`. */
function stubBox(element: HTMLElement, width: number, height: number): void {
  element.getBoundingClientRect = () =>
    ({ width, height, top: 0, left: 0, bottom: height, right: width }) as DOMRect;
}

let mount: HTMLElement;
let wrapper: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<div id="wrapper"><div id="app"></div></div>';
  document.body.setAttribute('style', 'margin: 8px; min-height: 100vh');
  wrapper = document.getElementById('wrapper')!;
  mount = document.getElementById('app')!;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('measureContentSize', () => {
  it("adds the space around the mount to its own box, and not the body's height", () => {
    wrapper.setAttribute('style', 'min-height: 100vh; padding: 16px 4px; border: 1px solid');
    stubBox(mount, 300.2, 40.5);
    // 40.5 high and 300.2 wide, with the wrapper's padding (32, 8) and border
    // (2, 2) and the body's margin (16, 16), rounded up.
    expect(measureContentSize(mount)).toEqual({ width: 327, height: 91 });
  });

  it("measures the children where the mount's height may follow the layout around it", () => {
    wrapper.setAttribute('style', 'display: flex; min-height: 100vh');
    stubBox(mount, 300, 900);
    mount.innerHTML = '<span></span><span></span>';
    const [first, second] = [...mount.children] as HTMLElement[];
    first.getBoundingClientRect = () => ({ top: 100, bottom: 120 }) as DOMRect;
    second.getBoundingClientRect = () => ({ top: 120, bottom: 150 }) as DOMRect;
    second.setAttribute('style', 'margin-bottom: 5px');
    // The children span 100 to 155; the body's margin adds 16.
    expect(measureContentSize(mount).height).toBe(71);
  });
});

describe('the html pane', () => {
  it('loads its own page, and its message carries markup, a reason, or neither while printing', () => {
    expect(PREVIEW_TARGETS).toEqual(['react', 'vue', 'svelte', 'html']);
    expect(componentFrameUrl('html', 2, '/kit/')).toBe('/kit/preview/html/preview.html?r=2');
    const message = markupMessage({ markup: '<p>hi</p>' });
    expect(readPreviewMessage(message)).toBe(message);
    expect(message).toEqual({ type: 'preview:markup', markup: '<p>hi</p>' });
    expect(markupMessage({ reason: 'none' })).toEqual({ type: 'preview:markup', reason: 'none' });
    expect(markupMessage({})).toEqual({ type: 'preview:markup' });
  });
});

describe('the content-size message', () => {
  it('reads a size only when both lengths are numbers of zero or more', () => {
    const message = contentSizeMessage({ width: 10, height: 20 });
    expect(readPreviewMessage(message)).toBe(message);
    expect(readContentSize(message)).toEqual({ width: 10, height: 20 });
    expect(readContentSize({ ...message, height: -1 })).toBeUndefined();
    expect(readContentSize({ ...message, width: Number.NaN })).toBeUndefined();
  });
});

describe('reportContentSize', () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  function flushFrame(): void {
    const pending = frames;
    frames = [];
    for (const callback of pending) callback(0);
  }

  it('posts once per animation frame, and only a size that changed', async () => {
    const posted: unknown[] = [];
    const parent = { postMessage: (message: unknown) => posted.push(message) };
    const target = Object.create(window, { parent: { value: parent } }) as Window;
    target.addEventListener = window.addEventListener.bind(window);
    target.removeEventListener = window.removeEventListener.bind(window);
    stubBox(mount, 100, 20);
    const stop = reportContentSize(mount, target);
    expect(reportContentSize(mount, target)).toBe(stop);

    flushFrame();
    expect(posted).toEqual([{ type: 'preview:content-size', width: 116, height: 36 }]);

    // A burst of changes is one report, and an unchanged size none.
    stubBox(mount, 100, 50);
    mount.textContent = 'one';
    mount.textContent = 'two';
    await Promise.resolve();
    expect(frames).toHaveLength(1);
    flushFrame();
    mount.textContent = 'three';
    await Promise.resolve();
    flushFrame();
    expect(posted).toEqual([
      { type: 'preview:content-size', width: 116, height: 36 },
      { type: 'preview:content-size', width: 116, height: 66 },
    ]);

    stop();
    stubBox(mount, 100, 80);
    mount.textContent = 'four';
    await Promise.resolve();
    flushFrame();
    expect(posted).toHaveLength(2);
  });
});

describe('announcePreviewShown', () => {
  it('posts preview:shown to the parent once, two animation frames on', () => {
    const frames: FrameRequestCallback[] = [];
    const parent = { postMessage: vi.fn() };
    const target = {
      parent,
      requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback),
    } as unknown as Window;
    announcePreviewShown(target);
    announcePreviewShown(target);
    expect(frames).toHaveLength(1);
    frames.shift()!(0);
    expect(parent.postMessage).not.toHaveBeenCalled();
    frames.shift()!(0);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'preview:shown' }, '*');
  });
});

describe('a two-way prop written back in the pane', () => {
  const bindings = [{ prop: 'value', changeProp: 'onValueChange' }];

  it('the set-story message carries the bindings, and none when there are none', () => {
    expect(setStoryMessage('inputs-field', {}, ['onValueChange'], bindings)).toEqual({
      type: 'preview:set-story',
      id: 'inputs-field',
      props: {},
      events: ['onValueChange'],
      bindings,
    });
    expect(setStoryMessage('inputs-field', {}, [], [])).not.toHaveProperty('bindings');
  });

  it('writes the value a given prop reports before the event runs on', () => {
    const calls: string[] = [];
    const props = withWriteBacks(
      { value: 'hello', onValueChange: (value: string) => calls.push(`event ${value}`) },
      bindings,
      (prop, value) => calls.push(`write ${prop} ${String(value)}`)
    );
    (props.onValueChange as (value: string) => void)('hXello');
    expect(calls).toEqual(['write value hXello', 'event hXello']);
  });

  it('writes a copy of plain data, and nothing else', () => {
    const written: unknown[] = [];
    const props = withWriteBacks({ value: ['a'] }, bindings, (_, value) => written.push(value));
    const next = ['a', 'b'];
    (props.onValueChange as (value: unknown) => void)(next);
    (props.onValueChange as (value: unknown) => void)(new Date(0));
    expect(written).toEqual([['a', 'b']]);
    expect(written[0]).not.toBe(next);
  });

  it('writes every given prop that reports through one change prop', () => {
    const written: string[] = [];
    const props = withWriteBacks(
      { value: 'a', mirror: 'a', other: undefined },
      [
        { prop: 'value', changeProp: 'onValueChange' },
        { prop: 'mirror', changeProp: 'onValueChange' },
        { prop: 'other', changeProp: 'onValueChange' },
      ],
      (prop, value) => written.push(`${prop} ${String(value)}`)
    );
    (props.onValueChange as (value: string) => void)('ab');
    expect(written).toEqual(['value ab', 'mirror ab']);
  });

  it('the set-story message carries the mount, and each recorded event the mount it was given', () => {
    expect(setStoryMessage('inputs-field', {}, [], [], 3)).toMatchObject({ mount: 3 });
    expect(setStoryMessage('inputs-field', {})).not.toHaveProperty('mount');
    const reports: unknown[] = [];
    const target = { parent: { postMessage: (message: unknown) => reports.push(message) } } as unknown as Window;
    (withEventRecorders({}, ['onValueChange'], target, 3).onValueChange as (value: string) => void)('a');
    (withEventRecorders({}, ['onValueChange'], target).onValueChange as (value: string) => void)('b');
    expect(reports).toEqual([
      expect.objectContaining({ name: 'onValueChange', value: 'a', mount: 3 }),
      expect.not.objectContaining({ mount: expect.anything() }),
    ]);
  });

  it('leaves a prop the story leaves out to the component', () => {
    const props = { label: 'Name' };
    expect(withWriteBacks(props, bindings, () => {})).toBe(props);
    expect(withWriteBacks({ value: undefined }, bindings, () => {})).not.toHaveProperty('onValueChange');
  });
});

describe("a pane's pending write-backs", () => {
  const bindings = [{ prop: 'value', changeProp: 'onValueChange' }];

  it("keeps the newest value it wrote over props the host sent before it took that write", () => {
    const pending = new PendingWriteBacks();
    expect(pending.wrote('value', 'hX')).toBe(1);
    expect(pending.wrote('value', 'hXY')).toBe(2);
    // The late echo of the first write.
    expect(pending.reconcile({ value: 'hX', label: 'Name' }, 1)).toEqual({ value: 'hXY', label: 'Name' });
    // Another control's change, sent before the host took any write, still
    // holds the value from before the typing.
    expect(pending.reconcile({ value: 'h', label: 'Full name' }, 0)).toEqual({ value: 'hXY', label: 'Full name' });
    // Once the host has taken the newest, its props are taken as they are.
    expect(pending.reconcile({ value: 'hXY' }, 2)).toEqual({ value: 'hXY' });
    expect(pending.reconcile({ value: 'reset' }, 2)).toEqual({ value: 'reset' });
  });

  it('takes props without answers as they are, and forgets its writes', () => {
    const pending = new PendingWriteBacks();
    pending.wrote('filters', { name: 'a' });
    expect(pending.reconcile({ filters: { name: 'from a test' } })).toEqual({ filters: { name: 'from a test' } });
    expect(pending.reconcile({ filters: { name: 'older' } }, 0)).toEqual({ filters: { name: 'older' } });
  });

  it('leaves a prop the host leaves out to the component, and forgets a new story\'s writes but not the count', () => {
    const pending = new PendingWriteBacks();
    pending.wrote('value', 'a');
    expect(pending.reconcile({}, 0)).toEqual({});
    pending.clear();
    expect(pending.reconcile({ value: 'b' }, 0)).toEqual({ value: 'b' });
    expect(pending.wrote('value', 'c')).toBe(2);
  });

  it('gives the next recorded event the number of the newest write since the last', () => {
    const reports: Record<string, unknown>[] = [];
    const target = { parent: { postMessage: (message: Record<string, unknown>) => reports.push(message) } } as unknown as Window;
    const pending = new PendingWriteBacks();
    const props = withWriteBacks(
      withEventRecorders({ value: '' }, ['onValueChange', 'onFocus'], target, 4, pending),
      bindings,
      (prop, value) => pending.wrote(prop, value),
    );
    (props.onValueChange as (value: string) => void)('a');
    (props.onFocus as () => void)();
    (props.onValueChange as (value: string) => void)('ab');
    expect(reports.map(({ name, write }) => [name, write])).toEqual([
      ['onValueChange', 1],
      ['onFocus', undefined],
      ['onValueChange', 2],
    ]);
    expect(reports[1]).not.toHaveProperty('write');
  });

  it('the props message carries what it answers only when it answers something', () => {
    expect(propsMessage({ value: 'a' }, 3)).toEqual({ type: 'preview:props', props: { value: 'a' }, answers: 3 });
    expect(propsMessage({ value: 'a' })).toEqual({ type: 'preview:props', props: { value: 'a' } });
  });
});

