import { describe, expect, it } from 'vitest';

import {
  consumerClass,
  mergeRootProps,
  withoutClass,
} from '../src/runtime/index.js';

describe('mergeRootProps', () => {
  it("returns the behavior's record untouched when the consumer passes nothing", () => {
    const machine = { id: 'root', 'data-part': 'root' };
    expect(mergeRootProps(machine, undefined)).toBe(machine);
  });

  it("keeps the behavior's value on a key both supply", () => {
    const merged = mergeRootProps(
      { id: 'machine-root', 'data-state': 'open', 'aria-expanded': true },
      { id: 'consumer-root', 'data-state': 'closed', 'data-testid': 'picker' }
    );
    expect(merged).toEqual({
      id: 'machine-root',
      'data-state': 'open',
      'aria-expanded': true,
      'data-testid': 'picker',
    });
  });

  it('gives the consumer every key the behavior leaves undefined', () => {
    const merged = mergeRootProps(
      { id: undefined, dir: 'ltr' },
      { id: 'consumer-root' }
    );
    expect(merged).toEqual({ id: 'consumer-root', dir: 'ltr' });
  });

  it('joins class names on every spelling', () => {
    expect(
      mergeRootProps({ className: 'machine' }, { className: 'consumer' })
        .className
    ).toBe('machine consumer');
    expect(
      mergeRootProps({ class: 'machine' }, { class: 'consumer' }).class
    ).toBe('machine consumer');
    // A Vue or Svelte class list or switched-name record flattens to text.
    expect(
      mergeRootProps(
        { class: 'machine' },
        { class: ['one', { two: true, three: false }] }
      ).class
    ).toBe('machine one two');
    expect(mergeRootProps({}, { className: 'consumer' }).className).toBe(
      'consumer'
    );
  });

  it('merges style records, the behavior winning a property both set', () => {
    const merged = mergeRootProps(
      { style: { position: 'absolute', '--machine': '1' } },
      { style: { position: 'relative', outlineColor: 'red' } }
    );
    expect(merged.style).toEqual({
      position: 'absolute',
      outlineColor: 'red',
      '--machine': '1',
    });
  });

  it('merges style text, the behavior declaring last', () => {
    expect(
      mergeRootProps({ style: 'position: absolute;' }, { style: 'color: red' })
        .style
    ).toBe('color: red; position: absolute');
    // A behavior's record against consumer text is written out as text.
    expect(
      mergeRootProps(
        { style: { userSelect: 'none', '--x': '2' } },
        { style: 'color: red' }
      ).style
    ).toBe('color: red; user-select: none; --x: 2');
  });

  it("runs the consumer's handler, then the behavior's", () => {
    const calls: string[] = [];
    const merged = mergeRootProps(
      { onClick: () => calls.push('machine') },
      { onClick: () => calls.push('consumer') }
    );
    (merged.onClick as (event: unknown) => void)({ defaultPrevented: false });
    expect(calls).toEqual(['consumer', 'machine']);
  });

  it("skips the behavior's handler when the consumer prevents the default", () => {
    const calls: string[] = [];
    const merged = mergeRootProps(
      { onkeydown: () => calls.push('machine') },
      {
        onkeydown: (event: { defaultPrevented: boolean }) => {
          calls.push('consumer');
          event.defaultPrevented = true;
        },
      }
    );
    (merged.onkeydown as (event: unknown) => void)({ defaultPrevented: false });
    expect(calls).toEqual(['consumer']);
  });

  describe("a Vue consumer's array of listeners", () => {
    const pressEvent = () => {
      const event = {
        defaultPrevented: false,
        preventDefault() {
          event.defaultPrevented = true;
        },
        stopImmediatePropagation() {},
      };
      return event;
    };
    type PressEvent = ReturnType<typeof pressEvent>;
    const fire = (handler: unknown, event: unknown = pressEvent()) =>
      (handler as (event: unknown) => void)(event);

    it("runs each in order, then the behavior's", () => {
      const calls: string[] = [];
      const merged = mergeRootProps(
        { onClick: () => calls.push('behavior') },
        { onClick: [() => calls.push('first'), () => calls.push('second')] }
      );
      fire(merged.onClick);
      expect(calls).toEqual(['first', 'second', 'behavior']);
    });

    it('flattens nested lists and skips what cannot be called', () => {
      const calls: string[] = [];
      const merged = mergeRootProps(
        { onClick: () => calls.push('behavior') },
        {
          onClick: [
            [() => calls.push('first'), [() => calls.push('second')]],
            null,
            false,
            [],
            () => calls.push('third'),
          ],
        }
      );
      fire(merged.onClick);
      expect(calls).toEqual(['first', 'second', 'third', 'behavior']);
    });

    it.each([[[]], [[[], [null]]]])(
      "leaves the behavior's handler as it is for the empty list %j",
      (onClick) => {
        const behavior = () => undefined;
        expect(mergeRootProps({ onClick: behavior }, { onClick }).onClick).toBe(
          behavior
        );
      }
    );

    it.each([
      ['first', 0],
      ['last', 1],
    ])(
      "skips the behavior's when the %s prevents, and still runs the others",
      (_name, preventing) => {
        const calls: string[] = [];
        const listener = (index: number) => (event: PressEvent) => {
          calls.push(`consumer ${index}`);
          if (index === preventing) event.preventDefault();
        };
        const merged = mergeRootProps(
          { onClick: () => calls.push('behavior') },
          { onClick: [listener(0), listener(1)] }
        );
        fire(merged.onClick);
        expect(calls).toEqual(['consumer 0', 'consumer 1']);
      }
    );

    it("stops the list at stopImmediatePropagation, as Vue does, and leaves the behavior's to preventDefault", () => {
      const calls: string[] = [];
      let stops = 0;
      const event = pressEvent();
      event.stopImmediatePropagation = () => {
        stops += 1;
      };
      const merged = mergeRootProps(
        { onClick: () => calls.push('behavior') },
        {
          onClick: [
            (received: PressEvent) => {
              calls.push('stopping');
              received.stopImmediatePropagation();
            },
            () => calls.push('later'),
          ],
        }
      );
      fire(merged.onClick, event);
      expect(calls).toEqual(['stopping', 'behavior']);
      expect(stops).toBe(1);
    });

    it('passes every parameter on, for an event that is not a DOM event', () => {
      const received: unknown[][] = [];
      const merged = mergeRootProps(
        { 'onUpdate:open': (...values: unknown[]) => received.push(values) },
        {
          'onUpdate:open': [(...values: unknown[]) => received.push(values)],
        }
      );
      (merged['onUpdate:open'] as (...values: unknown[]) => void)(true, 'x');
      expect(received).toEqual([
        [true, 'x'],
        [true, 'x'],
      ]);
    });

    it("keeps the behavior's handler over a value that is not a listener", () => {
      const behavior = () => undefined;
      expect(
        mergeRootProps({ onClick: behavior }, { onClick: 'wrong' }).onClick
      ).toBe(behavior);
    });

    it('leaves an array on a key the behavior does not supply to Vue', () => {
      const listeners = [() => undefined];
      expect(
        mergeRootProps({ id: 'root' }, { onClick: listeners }).onClick
      ).toBe(listeners);
    });
  });

  it('passes a consumer handler the behavior does not supply through as it is', () => {
    const onPointerEnter = () => undefined;
    expect(
      mergeRootProps({ onClick: () => undefined }, { onPointerEnter })
        .onPointerEnter
    ).toBe(onPointerEnter);
  });

  it('reads the class and style keys of a record that has neither', () => {
    // A reactive attribute record registers a dependency on read, so even an
    // empty one is read.
    const read = new Set<string | symbol>();
    const record = new Proxy({} as Record<string, unknown>, {
      get(target, key) {
        read.add(key);
        return target[key as string];
      },
    });
    mergeRootProps({ id: 'root' }, record);
    expect(read.has('class') && read.has('style')).toBe(true);
  });
});

describe('consumerClass and withoutClass', () => {
  it("reads the consumer's class in either spelling, as text", () => {
    expect(consumerClass({ className: 'one' })).toBe('one');
    expect(consumerClass({ class: ['one', { two: true, three: false }] })).toBe(
      'one two'
    );
    expect(consumerClass({ 'data-testid': 'x' })).toBeUndefined();
    expect(consumerClass(undefined)).toBeUndefined();
  });

  it('leaves every other attribute in the record', () => {
    expect(
      withoutClass({
        class: 'one',
        className: 'two',
        id: 'x',
        style: 'color: red',
      })
    ).toEqual({ id: 'x', style: 'color: red' });
  });
});

describe('consumerClass across spellings', () => {
  it('joins className and class when a record carries both', () => {
    expect(consumerClass({ className: 'one', class: 'two' })).toBe('one two');
  });

  it('passes no record through as none', () => {
    expect(withoutClass(undefined)).toBeUndefined();
  });
});
