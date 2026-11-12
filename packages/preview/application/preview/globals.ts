// Apply the kit-authored preview options to the preview document. Each option
// declares its effect in the kit's preview block (`apply`); this module is the
// single function that executes those effects on the iframe DOM - a generic loop
// over the registry, so adding an option needs no change here. Everything
// kit-specific (theme list, the page background, any wrapper the kit puts
// around the mount, the DOM-name prefix) comes from the kit's preview block,
// served as `@preview-configuration`; this module holds no kit vocabulary.
import {
  options as previewOptions,
  canvas as previewCanvas,
  themes as previewThemes,
  mount as previewMount,
  viewCanvas as previewViewCanvas,
} from '@preview-configuration';
import {
  optionsById as buildOptionsById,
  optionDefaults,
  themeHref,
  type ApplyTarget,
  type OptionValue,
  type PreviewOption,
  type PreviewMountNode,
} from '../../src/options';
import { announcePreviewOptions } from '../../src/protocol';
import { previewBaseUrl } from '../lib/base-url';

const canvas = previewCanvas;
const optionsById = buildOptionsById(previewOptions);
announcePreviewOptions(Object.values(optionsById));

// The code iframe (its mount marked in code.html) shows the kit's code block,
// not a component: it gets no mount wrapper and no story option, only the
// global options that set the page's look, and its mount fills the frame.
const codeFrame =
  document.getElementById('app')?.hasAttribute('data-preview-code') ?? false;
const defaultTheme = previewThemes[0]?.id;
const themeIds = new Set(previewThemes.map((theme) => theme.id));

const THEME_LINK_ID = `${canvas.namePrefix}-theme-css`;

function setTheme(theme: string): void {
  const id = themeIds.has(theme) ? theme : defaultTheme;
  if (!id) return;
  const href = themeHref(id, previewBaseUrl);
  let link = document.getElementById(THEME_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = THEME_LINK_ID;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}

// ── Mount wrapper ────────────────────────────────────────────────────────────
// A kit may declare a wrapper subtree (`mount`) rendered around the
// `#app` mount - framework-agnostic DOM the preview builds once at init and
// reparents `#app` into. The preview knows nothing of what the nodes mean (a
// kit's surface/box vocabulary lives entirely in its `mount` + CSS); it
// only records each `ref` so option applies can target a wrapper node. Omitted,
// `#app` stays a direct child of `<body>`.
const WRAPPER_MARK = `data-${canvas.namePrefix}-preview-wrapper`;

/** ref name → element, for `apply.target = { ref }` resolution. */
const referencedElements: Record<string, HTMLElement> = {};

function buildNode(node: PreviewMountNode): {
  root: HTMLElement;
  mount: HTMLElement | null;
} {
  const element = document.createElement(node.tag ?? 'div');
  if (node.attributes)
    for (const [name, value] of Object.entries(node.attributes))
      element.setAttribute(name, value);
  if (node.classes?.length) element.classList.add(...node.classes);
  if (node.style) element.setAttribute('style', node.style);
  if (node.ref) referencedElements[node.ref] = element;
  let mount = node.mount ? element : null;
  if (node.children)
    for (const child of node.children) {
      const built = buildNode(child);
      element.appendChild(built.root);
      // A deeper `mount: true` wins over an ancestor's (there is exactly one).
      if (built.mount) mount = built.mount;
    }
  return { root: element, mount };
}

function buildMountWrapper(): void {
  if (!previewMount) return;
  // The mount wrapper is the component stage. The custom-view iframe (the
  // preview's own `?view=` entry) hosts a view, not a component mount, and
  // shares this module only for theme + option apply - it gets no wrapper.
  if (new URLSearchParams(location.search).has('view') || codeFrame) return;
  const mountElement = document.getElementById('app');
  // Already wrapped (a redundant init on HMR) - leave it be.
  if (!mountElement || mountElement.closest(`[${WRAPPER_MARK}]`)) return;
  const parent = mountElement.parentElement ?? document.body;
  const { root, mount } = buildNode(previewMount);
  root.setAttribute(WRAPPER_MARK, '');
  // Slot the wrapper in where `#app` sat, then move `#app` into the mount node.
  parent.insertBefore(root, mountElement);
  (mount ?? root).appendChild(mountElement);
}

// ── Canvas ───────────────────────────────────────────────────────────────────
// One preview stylesheet, injected once: the page (`body`) paints the kit's page
// background only if the kit states one - a kit whose own stylesheet carries
// its page canvas omits `pageBackground` and the document is simply that
// page - and any wrapper geometry the kit wants (surface fills, insets,
// padding) rides in `canvas.extraCss`, keyed off the nodes the kit
// declares in `mount`. The preview authors none of it.
const PREVIEW_STYLE_ID = `${canvas.namePrefix}-preview-canvas`;
const classAttribute = `data-${canvas.namePrefix}-preview-class`;

// A scroll that reaches a frame's edge ends there: chained on to the host, it
// would scroll or bounce the shell around the pane.
const OVERSCROLL = `html { overscroll-behavior: contain; }`;

function ensureCanvasStyle(): void {
  if (document.getElementById(PREVIEW_STYLE_ID)) return;
  // A custom view's iframe has its own canvas: the kit's `viewCanvas`,
  // else the page background alone, since the component canvas's extra CSS
  // styles a mount wrapper a view does not have.
  const pageCanvas = new URLSearchParams(location.search).has('view')
    ? (previewViewCanvas ?? { pageBackground: canvas.pageBackground })
    : canvas;
  const style = document.createElement('style');
  style.id = PREVIEW_STYLE_ID;
  if (codeFrame) {
    // The page background alone, under a mount that fills the frame.
    style.textContent = [
      OVERSCROLL,
      `html, body, #app { height: 100%; }`,
      `body { margin: 0; }`,
      ...(canvas.pageBackground
        ? [`body { background: ${canvas.pageBackground}; }`]
        : []),
    ].join('\n');
    document.head.appendChild(style);
    return;
  }
  style.textContent = [
    OVERSCROLL,
    `body { min-height: 100vh; }`,
    ...(pageCanvas.pageBackground
      ? [`body { background: ${pageCanvas.pageBackground}; }`]
      : []),
    ...(pageCanvas.extraCss ? [pageCanvas.extraCss] : []),
  ].join('\n');
  document.head.appendChild(style);
}

// Build the wrapper, load the default theme + canvas stylesheet, and paint the
// options' defaults - all at module init, before the host sends its globals, so
// the first paint is fully styled. globals.ts runs at import, ahead of each
// entry's `createRoot`/`mount`, and `getElementById('app')` resolves after the
// reparent.
if (defaultTheme) setTheme(defaultTheme);
buildMountWrapper();
ensureCanvasStyle();
applyGlobals(optionDefaults(previewOptions));

// Story links are illustrations. A real navigation would load whatever the
// static server serves at that path INSIDE the pane - for the host's own
// document, the preview recursively - so every non-hash link click is made
// inert. Capture-phase, so a story component that stops propagation cannot
// reintroduce the navigation; preventDefault kills only the navigation, the
// component's own click handling still runs.
document.addEventListener(
  'click',
  (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const anchor = target?.closest('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) return;
    event.preventDefault();
  },
  { capture: true }
);

function elementForTarget(target: ApplyTarget): HTMLElement | null {
  if (target === 'root') return document.documentElement;
  if (target === 'body') return document.body;
  return referencedElements[target.ref] ?? null;
}

/** An option value as an attribute or property value: `false`, empty or
 *  unset clears it (`undefined`); anything else is its string form. */
function settableValue(
  value: OptionValue | null | undefined
): string | undefined {
  if (value === false || value === '' || value == null) return undefined;
  return String(value);
}

function setOrRemoveAttribute(
  element: HTMLElement,
  name: string,
  value: OptionValue
): void {
  const settable = settableValue(value);
  if (settable === undefined) element.removeAttribute(name);
  else element.setAttribute(name, settable);
}

function applyOne(option: PreviewOption, value: OptionValue): void {
  const apply = option.apply;
  switch (apply.type) {
    case 'root-attribute': {
      const element = elementForTarget(apply.target ?? 'root');
      if (!element) break;
      if (apply.omitAtDefault === true && value === option.default) {
        element.removeAttribute(apply.attribute);
      } else {
        setOrRemoveAttribute(element, apply.attribute, value);
      }
      break;
    }
    case 'stylesheet':
      if (typeof value === 'string' && value) setTheme(value);
      break;
    case 'class': {
      const element = elementForTarget(apply.target ?? apply.on ?? 'root');
      if (!element) break;
      if (apply.className)
        element.classList.toggle(apply.className, Boolean(value));
      else setOrRemoveAttribute(element, classAttribute, value);
      break;
    }
    case 'css-var': {
      const element = elementForTarget(apply.target ?? 'root');
      if (!element) break;
      const settable = settableValue(value);
      if (settable === undefined) element.style.removeProperty(apply.var);
      else element.style.setProperty(apply.var, settable);
      break;
    }
  }
}

/** Apply an options payload (id → value) to the preview document. Unknown ids and
 *  ids not in the payload are ignored, so partial payloads are safe. */
export function applyGlobals(
  options: Record<string, OptionValue> | undefined
): void {
  if (!options) return;
  for (const [id, value] of Object.entries(options)) {
    const option = optionsById[id];
    if (option && !(codeFrame && option.scope === 'story'))
      applyOne(option, value);
  }
}
