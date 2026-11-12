// Code iframe entry: the kit's own code block (`preview.codeBlock`),
// showing one target's source of the story, named by `?target=`. The entry
// loads the kit's setup module for the block's framework (named by
// `?framework=`, so its stylesheets come first, as in the view iframes), then
// the theme and canvas, then the block; it mounts the block with the first
// source the host sends, and hands it each one after through the `updates`
// it mounts with. The host sends a new source whenever the story, its props
// or its content change, or the shell's wrapping does, and the option values
// as it sends a story pane's.
import type { CodeBlockContent, CodeBlockLanguage, ViewFramework } from '../../../src/views';
import {
  announcePreviewReady,
  announcePreviewShown,
  CODE_TARGET_PARAMETER,
  PREVIEW_MESSAGE,
  PREVIEW_MOUNT_ELEMENT_ID,
  readPreviewMessage,
  VIEW_FRAMEWORK_PARAMETER,
} from '../../../src/protocol';

const parameters = new URLSearchParams(window.location.search);
const target = (parameters.get(CODE_TARGET_PARAMETER) ?? 'react') as CodeBlockContent['target'];

/** Each target's language, as a highlighter names it. */
const LANGUAGES: Record<CodeBlockContent['target'], CodeBlockLanguage> = {
  react: 'tsx',
  vue: 'vue',
  svelte: 'svelte',
  html: 'html',
};

type SetupFramework = Exclude<ViewFramework, 'dom'>;

// Each framework's setup module, loaded only for a block of that framework.
const SETUP_MODULES: Record<SetupFramework, () => Promise<unknown>> = {
  react: () => import('@preview-setup/react'),
  vue: () => import('@preview-setup/vue'),
  svelte: () => import('@preview-setup/svelte'),
};

function isSetupFramework(value: string | null): value is SetupFramework {
  return value !== null && Object.hasOwn(SETUP_MODULES, value);
}

let content: CodeBlockContent = { target, language: LANGUAGES[target], wrap: false };
const listeners = new Set<(content: CodeBlockContent) => void>();

async function start(): Promise<void> {
  const framework = parameters.get(VIEW_FRAMEWORK_PARAMETER);
  if (isSetupFramework(framework)) await SETUP_MODULES[framework]();
  const { applyGlobals } = await import('../globals');
  const { default: mount } = await import('@preview-code-block');
  const element = document.getElementById(PREVIEW_MOUNT_ELEMENT_ID);
  let mounted = false;

  window.addEventListener('message', (event: MessageEvent) => {
    const message = readPreviewMessage(event.data);
    if (!message) return;
    if (message.type === PREVIEW_MESSAGE.globals) applyGlobals(message.options);
    if (message.type !== PREVIEW_MESSAGE.code) return;
    content = {
      target,
      language: LANGUAGES[target],
      source: message.source,
      reason: message.reason,
      wrap: message.wrap === true,
    };
    if (!mounted && mount && element) {
      mounted = true;
      mount(element, content, {
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      });
      // The block, once painted, lets the host show the pane.
      announcePreviewShown();
      return;
    }
    for (const listener of listeners) listener(content);
  });
  // Signal readiness so the host sends the options and the source (an iframe
  // re-handshakes after each reload).
  announcePreviewReady();
}

void start();
