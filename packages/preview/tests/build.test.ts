// The static build checks the kit first: a check error stops it before
// anything is generated or built, the previous build removed all the same,
// and a kit the check passes is generated and handed to Vite's build.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPreview } from '../src/build';
import { checkPreview } from '../src/check';
import { loadPreviewContext } from '../src/context';
import { writeSourceKit } from './support/source-kit';

let kitRoot: string;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  kitRoot = mkdtempSync(join(tmpdir(), 'preview-build-'));
  writeSourceKit(kitRoot);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(kitRoot, { recursive: true, force: true });
});

describe('buildPreview', () => {
  it('stops on the check’s errors, building nothing and leaving no previous build behind', async () => {
    writeFileSync(
      join(kitRoot, 'preview/stories/Panel.story.ts'),
      `export default { defaultProps: { tone: 'calm', bogus: 1 } };\n`
    );
    const { staticRoot, generatedRoot } = loadPreviewContext(kitRoot);
    mkdirSync(staticRoot, { recursive: true });
    writeFileSync(join(staticRoot, 'index.html'), 'old');
    const build = vi.fn(async () => undefined);

    const result = await buildPreview(kitRoot, build);

    const { errors } = await checkPreview(kitRoot);
    expect(errors.length).toBeGreaterThan(0);
    expect(result).toEqual({ built: false, errors, warnings: expect.any(Array) });
    expect(build).not.toHaveBeenCalled();
    expect(existsSync(staticRoot)).toBe(false);
    expect(existsSync(join(generatedRoot, 'manifest.json'))).toBe(false);
  }, 60_000);

  it('generates and builds a kit the check passes', async () => {
    expect((await checkPreview(kitRoot)).errors).toEqual([]);
    const build = vi.fn(async () => undefined);

    const result = await buildPreview(kitRoot, build);

    expect(result).toEqual({ built: true, errors: [], warnings: (await checkPreview(kitRoot)).warnings });
    expect(build).toHaveBeenCalledTimes(1);
    expect(existsSync(join(loadPreviewContext(kitRoot).generatedRoot, 'manifest.json'))).toBe(true);
  }, 60_000);
});
