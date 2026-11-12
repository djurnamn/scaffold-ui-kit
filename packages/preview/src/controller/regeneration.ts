// How the controller regenerates the scratch story: the payload it sends and
// the transport that carries it. The development server answers the request;
// a static build has no endpoint, so a controller created without a transport
// reports regeneration as unavailable. Browser-safe.

import type { JsonValue, SlotPlan, StoryAround } from '../lib/types.js';

/** The scratch story to regenerate: the root component, its props and its slot content. */
export interface RegenerationPayload {
  /** The root component's export name. */
  rootComponent: string;
  /** The root's own props. */
  props: Record<string, JsonValue>;
  /** The root's slot content: its default slot and its named slots. */
  slots?: SlotPlan;
  /** The content beside the root, as its siblings: `before` and `after` it. */
  around?: StoryAround;
}

/**
 * Carries a regeneration payload to whatever writes the scratch story. It resolves
 * once the story is written and rejects with the reason it was not; the
 * controller reports the rejection's message.
 */
export type RegenerationTransport = (
  payload: RegenerationPayload
) => Promise<void>;

/** The path the preview's development server answers regeneration requests on. */
export const REGENERATION_ENDPOINT = '/__preview_regenerate';

/**
 * A transport that POSTs the payload as JSON to the development server's
 * regeneration endpoint. A response that is not ok rejects with the response's text,
 * or its status when the text is empty.
 *
 * @param endpoint - The endpoint's path; the development server's by default.
 * @param fetchImplementation - The `fetch` to use; the global one by default.
 * @returns The transport.
 */
export function createFetchRegenerationTransport(
  endpoint: string = REGENERATION_ENDPOINT,
  fetchImplementation: typeof fetch = (...parameters) => fetch(...parameters)
): RegenerationTransport {
  return async (payload) => {
    const response = await fetchImplementation(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `HTTP ${response.status}`);
    }
  };
}
