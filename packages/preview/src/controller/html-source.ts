// Where the controller gets a story's html source: the markup the story
// renders to, which needs the kit's templates and so cannot be printed in the
// browser. The development server prints it for any story on request; the
// static build prints it once per scenario and serves one file per
// component. A controller with neither reports html as unavailable.
// Browser-safe.

import type { JsonValue, SlotPlan, StoryAround } from '../lib/types.js';

/** A story to print as html: the root component, its props and its slot content. */
export interface HtmlSourceRequest {
  /** The root component's name. */
  rootComponent: string;
  /** The props to render it with. */
  props: Record<string, JsonValue>;
  /** Its slot content: the default slot and the named slots. */
  slots?: SlotPlan;
  /** The content beside the root, as its siblings: `before` and `after` it. */
  around?: StoryAround;
}

/**
 * A story's html: its markup, with the styles the kit's build wrote for the
 * components it renders when there are any and the warnings for what the
 * markup leaves out when there are any, or what keeps it from having markup.
 */
export type HtmlSourceResponse =
  | { markup: string; stylesheet?: string; warnings?: string[] }
  | { missing: string[] };

/**
 * Prints a story's html. It resolves with the markup or what the story holds
 * that has no markup, and rejects with the reason it could not print; the
 * controller aborts `signal` when the story changes before it answers.
 */
export type HtmlSourceTransport = (
  request: HtmlSourceRequest,
  signal: AbortSignal
) => Promise<HtmlSourceResponse>;

/**
 * Reads the html printed ahead of time for a component's scenarios, by
 * scenario id (`''` for the anonymous default). It rejects when there is
 * none to read.
 */
export type ScenarioHtmlSourceLoader = (
  componentId: string
) => Promise<Record<string, HtmlSourceResponse>>;

/** The path the preview's development server answers html source requests on. */
export const HTML_SOURCE_ENDPOINT = '/__preview_html_source';

/** The directory, under the URL the preview is served from, that the static
 *  build keeps each component's scenario html in, one `<component id>.json`
 *  each. */
export const HTML_SOURCE_DIRECTORY = 'html-source';

/**
 * A transport that POSTs the story as JSON to the development server's html
 * source endpoint and reads the JSON it answers. A response that is not ok
 * rejects with the response's text, or its status when the text is empty.
 *
 * @param endpoint - The endpoint's path; the development server's by default.
 * @param fetchImplementation - The `fetch` to use; the global one by default.
 * @returns The transport.
 */
export function createFetchHtmlSourceTransport(
  endpoint: string = HTML_SOURCE_ENDPOINT,
  fetchImplementation: typeof fetch = (...parameters) => fetch(...parameters)
): HtmlSourceTransport {
  return async (request, signal) => {
    const response = await fetchImplementation(endpoint, {
      method: 'POST',
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `HTTP ${response.status}`);
    }
    return (await response.json()) as HtmlSourceResponse;
  };
}

/**
 * A loader that fetches a component's scenario html from the files the
 * static build serves, `<baseUrl>html-source/<component id>.json`, once per
 * component.
 *
 * @param baseUrl - The URL the preview is served under, ending in `/`.
 * @param fetchImplementation - The `fetch` to use; the global one by default.
 * @returns The loader.
 */
export function createStaticHtmlSourceLoader(
  baseUrl: string,
  fetchImplementation: typeof fetch = (...parameters) => fetch(...parameters)
): ScenarioHtmlSourceLoader {
  const loaded = new Map<string, Promise<Record<string, HtmlSourceResponse>>>();
  return (componentId) => {
    let pending = loaded.get(componentId);
    if (!pending) {
      pending = fetchImplementation(
        `${baseUrl}${HTML_SOURCE_DIRECTORY}/${encodeURIComponent(componentId)}.json`
      ).then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as Record<string, HtmlSourceResponse>;
      });
      // A failed read is tried again the next time.
      pending.catch(() => loaded.delete(componentId));
      loaded.set(componentId, pending);
    }
    return pending;
  };
}
