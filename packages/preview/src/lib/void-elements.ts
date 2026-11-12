// HTML void elements: an html slot fill with one of these tags renders
// self-closed and takes no children. The list is the engine core's, so the
// preview and the templates' own output agree on it.

import { VOID_ELEMENTS } from '@js-template-engine/core';

/**
 * Whether a tag is an HTML void element.
 *
 * @param tag - The tag name, as an html fill writes it.
 * @returns True for a void element (`img`, `input`, `br`, ...).
 */
export function isVoidElement(tag: string): boolean {
  return VOID_ELEMENTS.has(tag.toLowerCase());
}
