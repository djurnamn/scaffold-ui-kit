// Svelte preview entry. The postMessage wiring + reactive props live in
// Preview.svelte (runes); this just mounts it. The theme stylesheet is loaded
// by globals.ts (imported via Preview.svelte).
// The kit's per-target setup module (side effects only) - see react/main.tsx.
import '@preview-setup/svelte';
import { mount } from 'svelte';
import Preview from './Preview.svelte';
import { PREVIEW_MOUNT_ELEMENT_ID, reportContentSize } from '../../../src/protocol';

const target = document.getElementById(PREVIEW_MOUNT_ELEMENT_ID)!;
mount(Preview, { target });
// The story's size reaches the host on each change, so a shell can size the pane to it.
reportContentSize(target);
