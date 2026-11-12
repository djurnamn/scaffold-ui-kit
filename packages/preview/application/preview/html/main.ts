// Html preview entry. Shows the markup a story renders to, as the host sends
// it, under what every story pane has: the kit's theme stylesheet, its canvas,
// its mount wrapper and its option values (globals.ts), with the stylesheets
// the kit lists for it (`htmlStylesheets`) and the styles the kit's build
// wrote for the components the markup renders, which arrive with it. No
// framework loads and no setup module runs: the markup is the kit's html at
// rest, and the pane runs none of the story's behavior. Html mode writes a
// declared event as a comment, so it does nothing; markup that carries
// behavior of its own (a script, an inline handler, a `javascript:` URL) has
// it taken out before it shows, and a form's submission is stopped, as
// globals.ts stops a link's navigation. While the next markup is printed the
// pane keeps what it shows; a story with none shows why.
import '@preview-html-stylesheets';
import { applyGlobals } from '../globals';
import {
  announcePreviewReady,
  announcePreviewShown,
  PREVIEW_MESSAGE,
  PREVIEW_MOUNT_ELEMENT_ID,
  readPreviewMessage,
  reportContentSize,
} from '../../../src/protocol';

const mount = document.getElementById(PREVIEW_MOUNT_ELEMENT_ID)!;

/** The attribute the pane marks its note with, when a story has no html. */
const UNAVAILABLE_ATTRIBUTE = 'data-preview-html-unavailable';

/** Elements that would run code or load a document of their own. */
const ACTIVE_ELEMENTS = 'script, iframe, object, embed, frame, frameset';

/** Attributes whose value a browser may run as a script. */
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);

/** Take out of `fragment` whatever would run: scripts and embedded
 *  documents, inline event handlers and `javascript:` URLs. */
function makeInert(fragment: DocumentFragment): void {
  for (const element of fragment.querySelectorAll(ACTIVE_ELEMENTS)) element.remove();
  for (const element of fragment.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const runs =
        name.startsWith('on') ||
        (URL_ATTRIBUTES.has(name) && /^\s*javascript:/i.test(attribute.value));
      if (runs) element.removeAttribute(attribute.name);
    }
  }
}

/** The element the styles of the shown markup's components are set in,
 *  after the theme's and the kit's stylesheets. */
const componentStyle = document.createElement('style');
componentStyle.setAttribute('data-preview-html-components', '');
document.head.appendChild(componentStyle);

function showMarkup(markup: string, stylesheet: string): void {
  if (componentStyle.textContent !== stylesheet) componentStyle.textContent = stylesheet;
  const template = document.createElement('template');
  template.innerHTML = markup;
  makeInert(template.content);
  mount.replaceChildren(template.content);
  mount.removeAttribute('aria-busy');
}

function showReason(reason: string): void {
  const note = document.createElement('p');
  note.setAttribute(UNAVAILABLE_ATTRIBUTE, '');
  note.textContent = reason;
  mount.replaceChildren(note);
  mount.removeAttribute('aria-busy');
}

// A form in the markup is an illustration: submitting it would load whatever
// its action names inside the pane.
document.addEventListener('submit', (event) => event.preventDefault(), { capture: true });

window.addEventListener('message', (event: MessageEvent) => {
  const message = readPreviewMessage(event.data);
  if (!message) return;
  if (message.type === PREVIEW_MESSAGE.globals) applyGlobals(message.options);
  else if (message.type === PREVIEW_MESSAGE.markup) {
    if (typeof message.markup === 'string')
      showMarkup(message.markup, typeof message.stylesheet === 'string' ? message.stylesheet : '');
    else if (typeof message.reason === 'string') showReason(message.reason);
    else mount.setAttribute('aria-busy', 'true');
    // The first markup or reason, once painted, lets the host show the pane.
    if (typeof message.markup === 'string' || typeof message.reason === 'string') announcePreviewShown();
  }
});

announcePreviewReady();
// The story's size reaches the host on each change, so a shell can size the pane to it.
reportContentSize(mount);
