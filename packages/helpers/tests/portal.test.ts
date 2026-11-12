// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';

import { portal, portalTo } from '../src/runtime/svelte/index.js';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('portal', () => {
  it('moves its node into the body by default, and removes it on destroy', () => {
    const host = document.createElement('section');
    const node = document.createElement('div');
    host.append(node);
    document.body.append(host);

    const action = portal(node);
    expect(node.parentElement).toBe(document.body);

    action.destroy();
    expect(node.isConnected).toBe(false);
  });

  it('moves its node to a new target on update, by selector or element', () => {
    const first = document.createElement('div');
    first.id = 'first';
    const second = document.createElement('div');
    document.body.append(first, second);
    const node = document.createElement('span');

    const action = portal(node, '#first');
    expect(node.parentElement).toBe(first);

    action.update(second);
    expect(node.parentElement).toBe(second);
  });

  it('leaves the node where it is when the selector matches nothing', () => {
    const host = document.createElement('section');
    const node = document.createElement('div');
    host.append(node);
    portal(node, '#nowhere');
    expect(node.parentElement).toBe(host);
  });
});

describe('portalTo', () => {
  it('gives one attachment per selector, so a spread on every render keeps it', () => {
    const first = Object.getOwnPropertySymbols(portalTo('body'));
    const again = portalTo('body');
    expect(first).toHaveLength(1);
    expect(again[first[0]]).toBe(portalTo('body')[first[0]]);
    expect(portalTo('#other')[first[0]]).not.toBe(again[first[0]]);
  });

  it('attaches by moving the node into the target, and detaches by removing it', () => {
    const record = portalTo('body');
    const [key] = Object.getOwnPropertySymbols(record);
    const attach = record[key] as (node: Element) => () => void;
    const host = document.createElement('section');
    const node = document.createElement('div');
    host.append(node);

    const detach = attach(node);
    expect(node.parentElement).toBe(document.body);
    detach();
    expect(node.isConnected).toBe(false);
  });
});
