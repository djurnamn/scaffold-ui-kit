// The packages the charcell shell needs the kit to install: a kit missing
// one is told which, by `check` (so `build` stops before Vite runs) and by
// the Vite configuration `dev` starts from, instead of getting a bundler
// error from inside the shell. A shell of the kit's own is not checked.

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildPreview } from '../src/build';
import { checkPreview } from '../src/check';
import { CHARCELL_SHELL, loadPreviewContext } from '../src/context';
import {
  CHARCELL_SHELL_PEERS,
  missingShellPeers,
  missingShellPeersProblem,
} from '../src/shell-peers';
import { buildViteConfiguration } from '../src/vite-configuration';

const here = dirname(fileURLToPath(import.meta.url));
const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A kit naming the charcell shell, from a stand-in preview package installed
 *  in the kit with the packages `installed` beside it; with `wrapper`, the
 *  kit's shell is a module of its own that imports the charcell shell to
 *  configure it. */
function charcellKit(
  installed: readonly string[],
  wrapper?: string
): string {
  const root = mkdtempSync(join(tmpdir(), 'preview-shell-peers-'));
  roots.push(root);
  const put = (path: string, content: string) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  put(
    'scaffold-ui-kit.json',
    JSON.stringify({
      name: 'kit',
      targets: ['react', 'vue', 'svelte'],
      preview: {
        shell: wrapper === undefined ? CHARCELL_SHELL : 'preview/shell.tsx',
        sources: [
          {
            id: 'kit',
            label: 'kit',
            order: 0,
            moduleBase: 'kit',
            templatesDirectory: 'templates',
          },
        ],
      },
    })
  );
  put(
    'templates/probe.ts',
    `export default { type: 'component', name: 'Probe', props: {}, children: [{ type: 'element', tag: 'span' }] };\n`
  );
  put(
    'node_modules/@scaffold-ui-kit/preview/package.json',
    JSON.stringify({
      name: '@scaffold-ui-kit/preview',
      exports: {
        './shells/charcell': './application/shells/charcell/index.tsx',
      },
    })
  );
  put(
    'node_modules/@scaffold-ui-kit/preview/application/shells/charcell/index.tsx',
    'export {};\n'
  );
  for (const name of installed)
    put(`node_modules/${name}/package.json`, JSON.stringify({ name }));
  if (wrapper !== undefined) put('preview/shell.tsx', wrapper);
  return root;
}

const configuringWrapper =
  "import { charcellShell } from '@scaffold-ui-kit/preview/shells/charcell';\n" +
  'export default charcellShell({ slots: {} });\n';

describe('the charcell shell’s packages', () => {
  it('are the preview’s peer dependencies', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(here, '../package.json'), 'utf8')
    ) as {
      peerDependencies: Record<string, string>;
    };
    expect([...CHARCELL_SHELL_PEERS].sort()).toEqual(
      Object.keys(manifest.peerDependencies).sort()
    );
  });

  it('names each one the kit has not installed, and nothing for a shell of its own', () => {
    expect(
      missingShellPeers(loadPreviewContext(charcellKit(['charcell'])))
    ).toEqual(['@zag-js/react']);
    expect(missingShellPeers(loadPreviewContext(charcellKit([])))).toEqual([
      'charcell',
      '@zag-js/react',
    ]);
    expect(
      missingShellPeers(
        loadPreviewContext(charcellKit(['charcell', '@zag-js/react']))
      )
    ).toEqual([]);
    expect(missingShellPeers({ charcellShellAbsolute: undefined })).toEqual(
      []
    );
  });

  it("are checked for a module of the kit's that configures the charcell shell, and not for a shell of its own", () => {
    const configuring = loadPreviewContext(
      charcellKit(['charcell'], configuringWrapper)
    );
    expect(configuring.shellModuleAbsolute).toBe(
      join(configuring.kitRoot, 'preview/shell.tsx')
    );
    // The package's real location, as the kit's own imports resolve.
    expect(configuring.charcellShellAbsolute).toBe(
      realpathSync(
        join(
          configuring.kitRoot,
          'node_modules/@scaffold-ui-kit/preview/application/shells/charcell/index.tsx'
        )
      )
    );
    expect(missingShellPeers(configuring)).toEqual(['@zag-js/react']);
    const named = loadPreviewContext(charcellKit(['charcell']));
    expect(named.charcellShellAbsolute).toBe(named.shellModuleAbsolute);
    const own = loadPreviewContext(
      charcellKit([], "import { defineShell } from '@scaffold-ui-kit/preview/shell';\nexport default defineShell({});\n")
    );
    expect(own.charcellShellAbsolute).toBeUndefined();
    expect(missingShellPeers(own)).toEqual([]);
  });

  it('are reported by check, which stops the build before Vite runs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const kitRoot = charcellKit(['charcell']);
    const problem =
      "the charcell shell needs @zag-js/react, which the kit has not installed: add it to the kit's devDependencies, as in `npm install --save-dev @zag-js/react`";
    expect((await checkPreview(kitRoot)).errors).toEqual([problem]);
    const build = vi.fn(async () => undefined);
    expect(await buildPreview(kitRoot, build)).toMatchObject({
      built: false,
      errors: [problem],
    });
    expect(build).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('stop the Vite configuration dev starts from', () => {
    expect(() =>
      buildViteConfiguration(loadPreviewContext(charcellKit([])))
    ).toThrow(
      "[preview] the charcell shell needs charcell and @zag-js/react, which the kit has not installed: add them to the kit's devDependencies, as in `npm install --save-dev charcell @zag-js/react`"
    );
    expect(missingShellPeersProblem([])).toBeUndefined();
  });
});
