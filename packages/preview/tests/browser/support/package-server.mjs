// What the packed-install smoke test's Playwright `webServer` runs. It checks
// the package as a kit installs it from npm: the preview is packed with
// `pnpm pack`, installed from the tarball into a copy of the fixture kit
// outside the workspace, and its `build` command renders the static preview,
// which is then served for the test to load, under a subpath (`/kit/`, as a
// project site is) so the build is shown to need no domain root of its own.
// The packed preview's `dist` is also checked against its sources, so a file
// left from an earlier build cannot ship. The engine packages the preview
// depends on are packed too and pinned by overrides, since the kit resolves
// them from the registry otherwise; charcell, the shell's optional peer, is
// linked from a checkout until it is published (CHARCELL_PATH names it,
// default ../../charcell beside this workspace).
//
// The kit is written to PREVIEW_PACKAGE_SMOKE_DIRECTORY (default
// <tmp>/scaffold-ui-kit-preview-package-smoke), wiped first and kept
// afterwards for a look. The port is PREVIEW_PACKAGE_PORT, default 6220.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { packageRoot, prepareFixtureKit, run } from './fixture-kit.mjs';
import { serveStatic } from './static-server.mjs';

const port = Number(process.env.PREVIEW_PACKAGE_PORT ?? '6220');
/** The subpath the static preview is served under; package.spec.ts loads it. */
const servedPath = '/kit/';
const workRoot = process.env.PREVIEW_PACKAGE_SMOKE_DIRECTORY ?? join(tmpdir(), 'scaffold-ui-kit-preview-package-smoke');
const charcellPath = resolve(packageRoot, process.env.CHARCELL_PATH ?? '../../../charcell');
const workspaceRoot = resolve(packageRoot, '../..');

/** The workspace packages the kit installs from tarballs: the preview and the
 *  engine packages it depends on, with theirs. */
const PACKED = [
  { name: '@scaffold-ui-kit/preview', directory: packageRoot },
  { name: '@js-template-engine/types', directory: resolve(workspaceRoot, 'packages/types') },
  { name: '@js-template-engine/core', directory: resolve(workspaceRoot, 'packages/core') },
  { name: '@js-template-engine/extension-bem', directory: resolve(workspaceRoot, 'packages/extension-bem') },
  { name: '@js-template-engine/extension-tailwind', directory: resolve(workspaceRoot, 'packages/extension-tailwind') },
];

if (!existsSync(join(charcellPath, 'package.json'))) {
  throw new Error(`charcell is not at ${charcellPath}; set CHARCELL_PATH to a checkout of it.`);
}

rmSync(workRoot, { recursive: true, force: true });
const tarballRoot = join(workRoot, 'tarballs');
mkdirSync(tarballRoot, { recursive: true });

// Pack: each tarball lands under its own directory, so the file name needs no guessing.
const tarballs = new Map();
for (const { name, directory } of PACKED) {
  const destination = join(tarballRoot, name.replace('/', '__'));
  mkdirSync(destination, { recursive: true });
  run('pnpm', ['pack', '--pack-destination', destination], { cwd: directory });
  const [file] = readdirSync(destination).filter((entry) => entry.endsWith('.tgz'));
  if (!file) throw new Error(`pnpm pack wrote no tarball for ${name}`);
  tarballs.set(name, `file:${join(destination, file)}`);
}

// Every compiled module in the packed preview has its source beside it: a
// module whose source is gone was left in `dist` by an earlier build.
const previewTarball = tarballs.get('@scaffold-ui-kit/preview').slice('file:'.length);
const packed = execFileSync('tar', ['-tzf', previewTarball], { encoding: 'utf8' }).split('\n');
const stale = packed
  .filter((entry) => /^package\/dist\/(?!declarations\/).*\.js$/.test(entry))
  .filter((entry) => !packed.includes(entry.replace(/^package\/dist\//, 'package/src/').replace(/\.js$/, '.ts')));
if (stale.length > 0) {
  throw new Error(`The packed preview ships compiled modules with no source:\n  ${stale.join('\n  ')}`);
}

// The kit: the fixture, built, with the installed preview in place of the link.
const kitRoot = join(workRoot, 'kit');
prepareFixtureKit(kitRoot, { linkPreview: false });
const manifest = JSON.parse(readFileSync(join(kitRoot, 'package.json'), 'utf8'));
const previewManifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
manifest.devDependencies = {
  '@scaffold-ui-kit/preview': tarballs.get('@scaffold-ui-kit/preview'),
  charcell: `link:${charcellPath}`,
  '@zag-js/react': previewManifest.peerDependencies['@zag-js/react'],
  react: previewManifest.dependencies.react,
  'react-dom': previewManifest.dependencies['react-dom'],
  svelte: previewManifest.dependencies.svelte,
  vue: previewManifest.dependencies.vue,
};
writeFileSync(join(kitRoot, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
// The overrides pin the preview's engine dependencies to the packed tarballs
// (pnpm reads them from the workspace file, which also keeps this kit its own
// workspace rather than part of any directory above it), and the build
// scripts a kit allows are the ones Vite's dependencies carry.
const overrides = [...tarballs]
  .filter(([name]) => name !== '@scaffold-ui-kit/preview')
  .map(([name, specifier]) => `  "${name}": "${specifier}"`)
  .join('\n');
writeFileSync(
  join(kitRoot, 'pnpm-workspace.yaml'),
  `packages: []\noverrides:\n${overrides}\nallowBuilds:\n  esbuild: true\n  "@parcel/watcher": true\n`,
);

run('pnpm', ['install', '--prefer-offline', '--config.confirmModulesPurge=false'], {
  cwd: kitRoot,
  env: { ...process.env, CI: 'true' },
});
run('pnpm', ['exec', 'scaffold-ui-kit-preview', 'build'], { cwd: kitRoot });

const staticRoot = join(kitRoot, '.preview-static');
if (!existsSync(join(staticRoot, 'index.html'))) {
  throw new Error(`The static build wrote no index.html under ${staticRoot}`);
}
console.log(`[package-smoke] kit at ${kitRoot}`);
await serveStatic(staticRoot, port, servedPath);
