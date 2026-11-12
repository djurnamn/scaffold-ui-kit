// @vitest-environment happy-dom
// Where the charcell shell, as shipped, places the kit's option controls: a
// global option of the kit's group in the top bar, ahead of the navigation; a
// story option, and a global option of the context group (or of none), in
// the output view's options popover; a global option of another group in the
// status bar, after the stage. The fixture
// kit has `theme` (group `kit`), `box`/`padded` (story, no group) and `mode`
// (group `canvas`). Each control is found by its label, and its place by the
// landmarks around it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createReactHostDriver } from './support/host-driver';

const driver = createReactHostDriver();

beforeEach(async () => {
  await driver.start({ url: '/' });
});

afterEach(async () => {
  await driver.stop();
});

/** Where the field labeled `label` sits: the output view's options popover,
 *  or relative to the navigation and the stage. */
function regionOf(label: string): 'top bar' | 'stage' | 'output options' | 'status bar' | undefined {
  const labelElement = [...document.querySelectorAll('label, span')].find(
    (candidate) => candidate.textContent === label && candidate.nextElementSibling !== null,
  );
  if (!labelElement) return undefined;
  if (labelElement.closest('[role="dialog"][aria-label="output options"]')) return 'output options';
  const navigation = document.querySelector('nav')!;
  const stage = document.querySelector('main')!;
  if (stage.contains(labelElement)) return 'stage';
  const following = (other: Element) =>
    Boolean(other.compareDocumentPosition(labelElement) & Node.DOCUMENT_POSITION_FOLLOWING);
  if (!following(navigation)) return 'top bar';
  return following(stage) ? 'status bar' : undefined;
}

describe('charcell shell - option placement', () => {
  it('places each option by its scope and group, with the widget its kind calls for', async () => {
    expect(regionOf('theme')).toBe('top bar');
    expect(regionOf('mode')).toBe('status bar');
    // The story options are in the output view's options popover.
    expect(regionOf('box')).toBeUndefined();
    await driver.openOutputOptions();
    expect(regionOf('box')).toBe('output options');
    expect(regionOf('padded')).toBe('output options');
    const field = (label: string) =>
      [...document.querySelectorAll('label, span')].find((candidate) => candidate.textContent === label)!
        .parentElement!;
    expect(field('theme').querySelector('[role="combobox"]')).not.toBeNull();
    expect(field('mode').querySelector('input[type="checkbox"]')).not.toBeNull();
  });
});
