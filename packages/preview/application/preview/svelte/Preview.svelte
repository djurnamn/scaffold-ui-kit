<script lang="ts">
  // Runes-mode host for the Svelte preview. The generated wrappers (registry
  // values) are runes components. The wrapper gets one object for the
  // story's props that never changes, each of whose props is a signal of its
  // own: an update sets the props that changed alone - a prop update on the
  // same instance, not a remount, keeping the Zag driver machine alive - and
  // a prop the story leaves out is never set, so a component keeps its own
  // two-way value while another prop changes.
  // Each story or scenario the host sets mounts fresh (`mount`), so
  // uncontrolled state never carries over from the last one. An error the
  // story throws shows in its place, as the React page's error boundary
  // shows one, rather than an empty pane, and the host hears of it, and of
  // each story mounted since.
  import { flushSync } from 'svelte';
  import { registry } from '@preview-generated/svelte/registry';
  // The scenario editor's regenerated scratch story, merged under its reserved id.
  import { registry as scratchRegistry } from '@preview-generated/scratch/registry';
  import { applyGlobals } from '../globals';
  import { paneProps, storyProps, type GivenProps } from './story-props';
  import {
    announcePreviewReady,
    announcePreviewShown,
    announcePreviewStories,
    announceStoryMounted,
    PREVIEW_MESSAGE,
    readPreviewMessage,
    reportRenderError,
  } from '../../../src/protocol';

  const all = { ...registry, ...scratchRegistry };

  let id = $state('');
  let mount = $state(0);

  // The story's props, each a signal of its own (see story-props.ts).
  const given = $state<GivenProps>({});
  const props = storyProps(given);
  // The story's events recorded and its two-way props written back as they
  // report a value, props the host sent before it took the newest keeping
  // the pane's own value (see story-props.ts).
  const story = paneProps(given);

  // Apply what is pending now, so what follows sees the story mounted or
  // gone. An error the flush lets through (one a story throws as it unmounts,
  // past the boundary) is the host's to hear of, not the pane's to stop on.
  function flush(): void {
    try {
      flushSync();
    } catch (error) {
      console.error(error);
      reportRenderError(error instanceof Error ? error.message : String(error));
    }
  }

  $effect(() => {
    function onMessage(event: MessageEvent) {
      const message = readPreviewMessage(event.data);
      if (!message) return;
      if (message.type === PREVIEW_MESSAGE.setStory) {
        reportRenderError();
        // The story mounted comes down before its props change: set first,
        // the next story's props would reach the one still mounted as it
        // unmounts, and a story that reads a prop it needs then, as one
        // stopping a headless machine does, would read it gone and throw.
        id = '';
        flush();
        story.setStory(message.props ?? {}, message);
        id = message.id;
        mount += 1;
        // Mounted, its effects run: the host may show the pane, and a test
        // may read the mount. Reported here rather than from an effect of
        // this component, which an error let through would stop for good.
        flush();
        announcePreviewShown();
        announceStoryMounted(message.id);
      } else if (message.type === PREVIEW_MESSAGE.props) {
        story.setProps(message.props, message.answers);
      } else if (message.type === PREVIEW_MESSAGE.globals) {
        applyGlobals(message.options);
      }
    }
    window.addEventListener('message', onMessage);
    announcePreviewStories(Object.keys(all));
    announcePreviewReady();
    return () => window.removeEventListener('message', onMessage);
  });
</script>

{#if id && all[id]}
  {@const Comp = all[id]}
  {#key mount}
    <svelte:boundary
      onerror={(error) => {
        console.error(error);
        reportRenderError(error instanceof Error ? error.message : String(error));
      }}
    >
      <Comp {props} />
      {#snippet failed(error)}
        <pre>render error: {error instanceof Error ? error.message : String(error)}</pre>
      {/snippet}
    </svelte:boundary>
  {/key}
{/if}
