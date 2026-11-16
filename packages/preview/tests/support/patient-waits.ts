// A wait in this suite polls for something a frame or a server does
// asynchronously, which takes milliseconds alone and can pass Vitest's one
// second while the whole workspace builds and tests beside it. Every
// `vi.waitFor` and `vi.waitUntil` that names no limit of its own gets this
// one.

import { vi } from 'vitest';

const LIMIT = { timeout: 20_000 };

const waitFor = vi.waitFor.bind(vi);
vi.waitFor = ((callback, options) =>
  waitFor(callback, options ?? LIMIT)) as typeof vi.waitFor;

const waitUntil = vi.waitUntil.bind(vi);
vi.waitUntil = ((callback, options) =>
  waitUntil(callback, options ?? LIMIT)) as typeof vi.waitUntil;
