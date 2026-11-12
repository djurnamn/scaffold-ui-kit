import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createJiti } from 'jiti';

import {
  CONSUMER_CLI_PACKAGE,
  PREVIEW_PACKAGE,
  rangeSatisfies,
  scaffoldKit,
  writeConsumerCli,
  type ScaffoldOptions,
} from '../src/scaffold';
import type { StylingName } from '../src/configuration';

let parentDirectory: string;

/** The kit configuration file `initialize` writes by default. */
const configurationFileName = 'scaffold-ui-kit.ts';

/** Loads a scaffolded kit's configuration module, its `scaffold-ui-kit`
 *  import resolved to this package's source. */
function readConfiguration(
  kitDirectory: string,
  file = configurationFileName
): Record<string, unknown> {
  const jiti = createJiti(__filename, {
    moduleCache: false,
    alias: { 'scaffold-ui-kit': join(__dirname, '../src/index.ts') },
  });
  return (
    jiti(join(kitDirectory, file)) as { default: Record<string, unknown> }
  ).default;
}

afterEach(() => {
  rmSync(parentDirectory, { recursive: true, force: true });
});

function scaffold(overrides: Partial<ScaffoldOptions> = {}): string {
  parentDirectory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-scaffold-'));
  scaffoldKit({
    projectName: 'test-kit',
    parentDirectory,
    targets: ['react', 'vue'],
    styling: ['bem'],
    includeExamples: true,
    ...overrides,
  });
  return join(parentDirectory, overrides.projectName ?? 'test-kit');
}

describe('scaffoldKit', () => {
  it('creates the kit files', () => {
    const kitDirectory = scaffold();
    for (const file of [
      'package.json',
      configurationFileName,
      'tsconfig.json',
      '.gitignore',
      'README.md',
      join('bin', 'add.mjs'),
      join('src', 'components', 'button.ts'),
      join('src', 'components', 'card.ts'),
    ]) {
      expect(existsSync(join(kitDirectory, file)), file).toBe(true);
    }
  });

  it('writes the chosen targets and styling into the configuration', () => {
    const kitDirectory = scaffold({
      targets: ['svelte', 'html'],
      styling: ['bem', 'tailwind'],
      includePreview: false,
    });
    expect(readConfiguration(kitDirectory)).toEqual({
      name: 'test-kit',
      targets: ['svelte', 'html'],
      styling: ['bem', 'tailwind'],
      add: {
        notes: [
          'These components use Tailwind utility classes: make sure your Tailwind build scans the directory you copied them into. Tailwind v4 finds it on its own unless it is git-ignored; otherwise add an @source pointing at it from your entry stylesheet (in Tailwind v3, add it to content).',
        ],
        ownership: 'partial',
      },
    });
  });

  it('writes separate stylesheets linked both ways for a kit with stylesheets', () => {
    for (const styling of [['bem'], []] as ScaffoldOptions['styling'][]) {
      const configuration = readConfiguration(
        scaffold({ styling, includePreview: false })
      );
      expect(configuration.stylesheetPlacement).toBe('separate-file');
      expect(configuration.stylesheetLink).toBe('both');
      expect(configuration.add).toEqual({ ownership: 'partial' });
      rmSync(parentDirectory, { recursive: true, force: true });
    }
    const tailwind = readConfiguration(
      scaffold({ styling: ['tailwind'], includePreview: false })
    );
    expect(tailwind.stylesheetPlacement).toBeUndefined();
    expect(tailwind.stylesheetLink).toBeUndefined();
  });

  it('exports each component unlinked in a kit with stylesheets, and no stylesheets a kit never gets', () => {
    const manifestOf = (kitDirectory: string) =>
      JSON.parse(readFileSync(join(kitDirectory, 'package.json'), 'utf8'));
    const linked = manifestOf(
      scaffold({ targets: ['react', 'vue'], styling: ['bem'] })
    );
    expect(linked.sideEffects).toEqual(['**/*.css', '**/*.scss']);
    expect(linked.exports).toEqual({
      './react': './dist/react/index.ts',
      './react/unlinked': './dist/react/unlinked/index.ts',
      './react/unlinked/*': './dist/react/*.tsx',
      './react/*': './dist/react/linked/*.ts',
      './react/*.css': './dist/react/*.css',
      './vue': './dist/vue/index.ts',
      './vue/unlinked': './dist/vue/unlinked/index.ts',
      './vue/unlinked/*': './dist/vue/*',
      './vue/*': './dist/vue/linked/*.ts',
      './vue/*.css': './dist/vue/*.css',
    });
    rmSync(parentDirectory, { recursive: true, force: true });
    const classes = manifestOf(
      scaffold({ targets: ['react', 'vue'], styling: ['tailwind'] })
    );
    expect(classes.sideEffects).toBeUndefined();
    expect(classes.exports).toEqual({
      './react': './dist/react/index.ts',
      './react/*': './dist/react/*.tsx',
      './vue': './dist/vue/index.ts',
      './vue/*': './dist/vue/*',
    });
  });

  it('sets jsx in the tsconfig of a kit with the react target only', () => {
    const compilerOptionsOf = (kitDirectory: string) =>
      JSON.parse(readFileSync(join(kitDirectory, 'tsconfig.json'), 'utf8'))
        .compilerOptions;
    expect(compilerOptionsOf(scaffold()).jsx).toBe('react-jsx');
    rmSync(parentDirectory, { recursive: true, force: true });
    expect(compilerOptionsOf(scaffold({ targets: ['vue'] })).jsx).toBe(
      undefined
    );
  });

  it('writes the example Button as a real button', () => {
    const source = readFileSync(
      join(scaffold(), 'src', 'components', 'button.ts'),
      'utf8'
    );
    expect(source).toContain('passthrough: true');
    expect(source).not.toContain('console.log');
    expect(source).not.toContain('events:');
  });

  describe.each([
    ['without Tailwind', ['bem'] as StylingName[]],
    ['with Tailwind', ['tailwind'] as StylingName[]],
  ])('the example components %s', (_name, styling) => {
    it.each([
      ['button', 'label'],
      ['card', 'title'],
    ])(
      "gives the %s's %s a default, so a first render shows it",
      (file, prop) => {
        const jiti = createJiti(__filename, {
          moduleCache: false,
          alias: {
            '@js-template-engine/types': join(
              __dirname,
              '../node_modules/@js-template-engine/types'
            ),
          },
        });
        const { default: template } = jiti(
          join(scaffold({ styling }), 'src', 'components', `${file}.ts`)
        ) as { default: { props: Record<string, Record<string, unknown>> } };
        expect(template.props[prop].required).toBeUndefined();
        expect(template.props[prop].default).toEqual(expect.any(String));
        expect(template.props[prop].default).not.toBe('');
      }
    );
  });

  it('names the package and its consumer bin after the project', () => {
    const kitDirectory = scaffold({ projectName: 'acme-design' });
    const packageJson = JSON.parse(
      readFileSync(join(kitDirectory, 'package.json'), 'utf8')
    );
    expect(packageJson.name).toBe('acme-design');
    expect(packageJson.bin).toEqual({ 'acme-design': './bin/add.mjs' });
    expect(packageJson.scripts.build).toBe('scaffold-ui-kit build');
    expect(Object.keys(packageJson.devDependencies)).toContain(
      'scaffold-ui-kit'
    );
  });

  const optional = { optional: true };
  it.each([
    [['react'], { react: '^19.0.0' }, undefined],
    [['vue'], { vue: '^3.5.0' }, undefined],
    [['svelte'], { svelte: '^5.0.0' }, undefined],
    // The html target has no framework, so this is one scripted target.
    [['react', 'html'], { react: '^19.0.0' }, undefined],
    [
      ['react', 'vue'],
      { react: '^19.0.0', vue: '^3.5.0' },
      { react: optional, vue: optional },
    ],
    [
      ['react', 'vue', 'svelte', 'html'],
      { react: '^19.0.0', svelte: '^5.0.0', vue: '^3.5.0' },
      { react: optional, svelte: optional, vue: optional },
    ],
    [['html'], undefined, undefined],
  ] as const)(
    'declares the framework floor of %j as a peer range, and installs it for the kit itself',
    (targets, peers, peersMeta) => {
      const packageJson = JSON.parse(
        readFileSync(
          join(scaffold({ targets: [...targets] }), 'package.json'),
          'utf8'
        )
      );
      expect(packageJson.peerDependencies).toEqual(peers);
      expect(packageJson.peerDependenciesMeta).toEqual(peersMeta);
      expect(packageJson.devDependencies).toMatchObject(peers ?? {});
    }
  );

  it('writes examples styled with utilities and no style block for a kit styled with Tailwind', () => {
    const example = (kitDirectory: string, file: string): string =>
      readFileSync(join(kitDirectory, 'src', 'components', file), 'utf8');
    const tailwindKit = scaffold({ styling: ['tailwind'] });
    for (const file of ['button.ts', 'card.ts']) {
      expect(example(tailwindKit, file)).not.toMatch(/\bstyle:/);
      expect(example(tailwindKit, file)).toContain('tailwind: {');
    }
    rmSync(parentDirectory, { recursive: true, force: true });
    const bemKit = scaffold({ styling: ['bem'] });
    expect(example(bemKit, 'button.ts')).toMatch(/\bstyle:/);
  });

  it('skips the example components with includeExamples false', () => {
    const kitDirectory = scaffold({ includeExamples: false });
    expect(existsSync(join(kitDirectory, 'src', 'components'))).toBe(true);
    expect(
      existsSync(join(kitDirectory, 'src', 'components', 'button.ts'))
    ).toBe(false);
    const readme = readFileSync(join(kitDirectory, 'README.md'), 'utf8');
    expect(readme).toContain('documentation/getting-started.md');
    expect(readme).not.toContain('example templates');
  });

  it('points the kit README at the guide and the example templates', () => {
    const readme = readFileSync(join(scaffold(), 'README.md'), 'utf8');
    expect(readme).toContain('documentation/getting-started.md');
    expect(readme).toContain('the example templates show it in use');
  });

  it('skips the preview with includePreview false', () => {
    const kitDirectory = scaffold({ includePreview: false });
    expect(existsSync(join(kitDirectory, 'preview'))).toBe(false);
    const packageJson = JSON.parse(
      readFileSync(join(kitDirectory, 'package.json'), 'utf8')
    );
    // The kit's consumers import its pieces with or without a preview.
    expect(Object.keys(packageJson.exports)).toContain('./react/*');
    expect(packageJson.scripts.preview).toBeUndefined();
    expect(Object.keys(packageJson.devDependencies)).toEqual([
      '@js-template-engine/types',
      'react',
      'scaffold-ui-kit',
      'typescript',
      'vue',
    ]);
    expect(readFileSync(join(kitDirectory, '.gitignore'), 'utf8')).toBe(
      'node_modules/\ndist/\n'
    );
  });

  it("lets pnpm run the toolchain's install scripts, in a file every pnpm accepts and a published kit leaves out", () => {
    const kitDirectory = scaffold();
    expect(
      readFileSync(join(kitDirectory, 'pnpm-workspace.yaml'), 'utf8')
    ).toBe(
      `packages:
  - '.'

# The install scripts pnpm may run for this kit's toolchain.
allowBuilds:
  '@parcel/watcher': true
  esbuild: true
`
    );
    expect(
      (
        JSON.parse(
          readFileSync(join(kitDirectory, 'package.json'), 'utf8')
        ) as { files: string[] }
      ).files
    ).not.toContain('pnpm-workspace.yaml');
  });

  it('leaves the build allow-list to a pnpm workspace the kit is created inside', () => {
    parentDirectory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-scaffold-'));
    writeFileSync(
      join(parentDirectory, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n"
    );
    const packagesDirectory = join(parentDirectory, 'packages');
    mkdirSync(packagesDirectory);
    const created = scaffoldKit({
      projectName: 'test-kit',
      parentDirectory: packagesDirectory,
      targets: ['react', 'vue'],
      styling: ['bem'],
      includeExamples: false,
    });
    expect(created).not.toContain('pnpm-workspace.yaml');
    expect(
      existsSync(join(packagesDirectory, 'test-kit', 'pnpm-workspace.yaml'))
    ).toBe(false);
  });

  it('refuses a non-empty existing directory', () => {
    parentDirectory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-scaffold-'));
    mkdirSync(join(parentDirectory, 'test-kit'));
    writeFileSync(join(parentDirectory, 'test-kit', 'occupied.txt'), 'x');
    expect(() =>
      scaffoldKit({
        projectName: 'test-kit',
        parentDirectory,
        targets: ['react'],
        styling: [],
        includeExamples: true,
      })
    ).toThrow('already exists and is not empty');
  });
});

describe('consumer CLI', () => {
  const version = JSON.parse(
    readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
  ).version as string;

  it('makes a new kit depend on the consumer CLI package through a shim', () => {
    const kitDirectory = scaffold();
    const packageJson = JSON.parse(
      readFileSync(join(kitDirectory, 'package.json'), 'utf8')
    );
    expect(packageJson.dependencies).toEqual({
      [CONSUMER_CLI_PACKAGE]: `^${version}`,
    });
    const shim = readFileSync(join(kitDirectory, 'bin', 'add.mjs'), 'utf8');
    expect(shim).toContain(`import { runAdd } from '${CONSUMER_CLI_PACKAGE}';`);
    expect(writeConsumerCli(kitDirectory)).toEqual([]);
  });

  it('moves a kit carrying its own copy of the CLI onto the shim', () => {
    parentDirectory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-scaffold-'));
    const kitDirectory = join(parentDirectory, 'old-kit');
    mkdirSync(join(kitDirectory, 'bin'), { recursive: true });
    writeFileSync(
      join(kitDirectory, 'bin', 'add.mjs'),
      '// a full copy of the CLI\n'
    );
    writeFileSync(
      join(kitDirectory, 'package.json'),
      `${JSON.stringify(
        {
          name: 'old-kit',
          dependencies: { lodash: '^4.0.0', 'use-bem': '^1.0.0' },
          devDependencies: {},
        },
        null,
        4
      )}\n`
    );

    expect(writeConsumerCli(kitDirectory)).toEqual([
      join('bin', 'add.mjs'),
      'package.json',
    ]);
    const source = readFileSync(join(kitDirectory, 'package.json'), 'utf8');
    // Inserted in name order, as npm and pnpm write dependencies.
    expect(Object.entries(JSON.parse(source).dependencies)).toEqual([
      [CONSUMER_CLI_PACKAGE, `^${version}`],
      ['lodash', '^4.0.0'],
      ['use-bem', '^1.0.0'],
    ]);
    // The kit's own indentation is kept.
    expect(source).toContain('\n    "name": "old-kit"');
    expect(writeConsumerCli(kitDirectory)).toEqual([]);
  });

  /** A kit whose consumer CLI dependency is `spec`, and the CLI run on it. */
  function runWithSpec(spec: string): {
    dependency: string;
    written: string[];
    lines: string[];
  } {
    parentDirectory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-scaffold-'));
    const kitDirectory = join(parentDirectory, 'kit');
    mkdirSync(kitDirectory, { recursive: true });
    writeFileSync(
      join(kitDirectory, 'package.json'),
      JSON.stringify({
        name: 'kit',
        dependencies: { [CONSUMER_CLI_PACKAGE]: spec },
      })
    );
    const lines: string[] = [];
    const written = writeConsumerCli(kitDirectory, {
      report: (line) => lines.push(line),
    });
    const dependency = JSON.parse(
      readFileSync(join(kitDirectory, 'package.json'), 'utf8')
    ).dependencies[CONSUMER_CLI_PACKAGE];
    return { dependency, written, lines };
  }

  it.each([
    'file:../add',
    'link:../add',
    'workspace:*',
    'workspace:^',
    '2.2.0',
    'latest',
    '^2.0.0',
    '>=1.0.0',
    '*',
  ])("keeps a kit's own spec %s", (spec) => {
    const { dependency, written, lines } = runWithSpec(spec);
    expect(dependency).toBe(spec);
    expect(written).toEqual([join('bin', 'add.mjs')]);
    expect(lines).toEqual([`wrote ${join('bin', 'add.mjs')}`]);
  });

  it('tells the author to install when it adds the dependency', () => {
    parentDirectory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-scaffold-'));
    const kitDirectory = join(parentDirectory, 'kit');
    mkdirSync(kitDirectory, { recursive: true });
    writeFileSync(
      join(kitDirectory, 'package.json'),
      JSON.stringify({ name: 'kit', dependencies: { lodash: '^4.0.0' } })
    );
    const lines: string[] = [];
    writeConsumerCli(kitDirectory, { report: (line) => lines.push(line) });
    expect(lines).toContain(
      `set ${CONSUMER_CLI_PACKAGE} to ^${version} in package.json; run your package manager's install before the kit's add command`
    );
  });

  it('moves a range the current version does not satisfy, saying what it was', () => {
    const { dependency, written, lines } = runWithSpec('^1.0.0');
    expect(dependency).toBe(`^${version}`);
    expect(written).toContain('package.json');
    expect(lines).toContain(
      `set ${CONSUMER_CLI_PACKAGE} to ^${version} in package.json (was ^1.0.0)`
    );
  });
});

describe('rangeSatisfies', () => {
  it.each([
    ['^2.1.0', '2.3.0', true],
    ['^2.3.0', '2.3.0', true],
    ['^3.0.0', '2.3.0', false],
    ['^1.9.0', '2.3.0', false],
    ['^0.2.0', '0.2.5', true],
    ['^0.2.0', '0.3.0', false],
    ['~2.3.0', '2.3.4', true],
    ['~2.2.0', '2.3.0', false],
    ['~2', '2.9.0', true],
    ['2.x', '2.3.0', true],
    ['1.x', '2.3.0', false],
    ['*', '2.3.0', true],
    ['>=2.0.0 <2.3.0', '2.3.0', false],
    ['>=2.0.0 <3', '2.3.0', true],
    ['>2.3.0', '2.3.0', false],
    ['<=2.3', '2.3.9', true],
    ['^1.0.0 || ^2.0.0', '2.3.0', true],
    ['^2.0.0', '2.3.0-beta.1', false],
    ['*', '2.3.0-beta.1', false],
  ] as const)('%s with %s is %s', (range, version, expected) => {
    expect(rangeSatisfies(range, version)).toBe(expected);
  });

  it.each([
    '2.2.0',
    '=2.3.0',
    '2.3.0+build.5',
    'file:../add',
    'link:../add',
    'workspace:^',
    'latest',
    'github:owner/add',
    '^2.3.0-beta.1',
    '>=2.0.0-rc.1 <3',
    '1.0.0 - 3.0.0',
    '>= 2.0.0',
    '~>2.3',
    '^2.0.0+build',
    '',
  ])('leaves %s undecided', (range) => {
    expect(rangeSatisfies(range, '2.3.0')).toBeUndefined();
  });
});

describe('preview', () => {
  const version = JSON.parse(
    readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
  ).version as string;

  it('writes a preview block naming the charcell shell, with the data the preview reads', () => {
    const kitDirectory = scaffold({ projectName: 'acme.design' });
    expect(readConfiguration(kitDirectory).preview).toEqual({
      shell: '@scaffold-ui-kit/preview/shells/charcell',
      sources: [
        {
          id: 'kit',
          label: 'Components',
          order: 0,
          moduleBase: 'acme.design',
          templatesDirectory: 'src/components',
          storiesDirectory: 'preview/stories',
        },
      ],
      themes: [],
      canvas: { namePrefix: 'acme-design' },
      options: [],
    });
    expect(
      existsSync(join(kitDirectory, 'preview', 'stories', '.gitkeep'))
    ).toBe(true);
    expect(
      existsSync(join(kitDirectory, 'preview', 'preview-configuration.ts'))
    ).toBe(false);
  });

  it('writes scaffold-ui-kit.ts with defineKit, typed by the preview when the kit has it', () => {
    const kitDirectory = scaffold({ projectName: 'acme-design' });
    const source = readFileSync(
      join(kitDirectory, configurationFileName),
      'utf8'
    );
    expect(
      source.startsWith(`/// <reference types="${PREVIEW_PACKAGE}" />\n`)
    ).toBe(true);
    expect(source).toContain(
      "import { defineKit } from 'scaffold-ui-kit';\n\nexport default defineKit({\n  name: 'acme-design',\n"
    );
    expect(source).toContain("    canvas: { namePrefix: 'acme-design' },\n");
    rmSync(parentDirectory, { recursive: true, force: true });
    const plain = readFileSync(
      join(scaffold({ includePreview: false }), configurationFileName),
      'utf8'
    );
    expect(plain).toBe(
      [
        "// The kit's configuration, read by `scaffold-ui-kit build`. The",
        '// scaffold-ui-kit README describes each key.',
        "import { defineKit } from 'scaffold-ui-kit';",
        '',
        'export default defineKit({',
        "  name: 'test-kit',",
        "  targets: ['react', 'vue'],",
        "  styling: ['bem'],",
        "  stylesheetPlacement: 'separate-file',",
        "  stylesheetLink: 'both',",
        "  add: { ownership: 'partial' },",
        '});',
        '',
      ].join('\n')
    );
  });

  it('writes the configuration where configurationFile says, recording any other path in package.json', () => {
    const jsonKit = scaffold({ configurationFile: 'scaffold-ui-kit.json' });
    expect(existsSync(join(jsonKit, 'scaffold-ui-kit.ts'))).toBe(false);
    expect(
      JSON.parse(readFileSync(join(jsonKit, 'tsconfig.json'), 'utf8')).include
    ).toEqual(['src/**/*']);
    expect(
      JSON.parse(readFileSync(join(jsonKit, 'scaffold-ui-kit.json'), 'utf8'))
        .preview.canvas
    ).toEqual({ namePrefix: 'test-kit' });
    expect(
      JSON.parse(readFileSync(join(jsonKit, 'package.json'), 'utf8'))[
        'scaffold-ui-kit'
      ]
    ).toBeUndefined();
    rmSync(parentDirectory, { recursive: true, force: true });
    const elsewhere = scaffold({ configurationFile: 'configuration/kit.ts' });
    expect(readConfiguration(elsewhere, 'configuration/kit.ts').name).toBe(
      'test-kit'
    );
    // The kit's tsconfig checks a TypeScript configuration with its sources.
    expect(
      JSON.parse(readFileSync(join(elsewhere, 'tsconfig.json'), 'utf8')).include
    ).toEqual(['src/**/*', 'configuration/kit.ts']);
    expect(
      JSON.parse(readFileSync(join(elsewhere, 'package.json'), 'utf8'))[
        'scaffold-ui-kit'
      ]
    ).toEqual({ configuration: 'configuration/kit.ts' });
    rmSync(parentDirectory, { recursive: true, force: true });
    expect(() => scaffold({ configurationFile: 'kit.yaml' })).toThrow(
      "The kit configuration 'kit.yaml' must be a .ts, .mts, .cts, .js, .mjs, .cjs, .json file inside the kit"
    );
    rmSync(parentDirectory, { recursive: true, force: true });
    // Any module type the build reads; a TypeScript one is type-checked.
    const module = scaffold({ configurationFile: 'kit.mts' });
    expect(readConfiguration(module, 'kit.mts').name).toBe('test-kit');
    expect(
      JSON.parse(readFileSync(join(module, 'tsconfig.json'), 'utf8')).include
    ).toEqual(['src/**/*', 'kit.mts']);
    rmSync(parentDirectory, { recursive: true, force: true });
    expect(() =>
      scaffold({
        configurationFile: 'configuration/scaffold-ui-kit.config.json',
      })
    ).toThrow(
      "The kit configuration can't be named scaffold-ui-kit.config.json"
    );
  });

  it('adds the preview dependencies, script, exports and ignored directories', () => {
    const kitDirectory = scaffold({ targets: ['html', 'react', 'svelte'] });
    const packageJson = JSON.parse(
      readFileSync(join(kitDirectory, 'package.json'), 'utf8')
    );
    expect(packageJson.devDependencies).toEqual({
      '@js-template-engine/types': `^${version}`,
      [PREVIEW_PACKAGE]: `^${version}`,
      '@zag-js/react': '^1.44.0',
      charcell: '^0.1.0',
      react: '^19.0.0',
      'scaffold-ui-kit': `^${version}`,
      svelte: '^5.0.0',
      typescript: '^5.8.0',
    });
    expect(Object.keys(packageJson.devDependencies)).toEqual(
      Object.keys(packageJson.devDependencies).sort((a, b) =>
        a.localeCompare(b)
      )
    );
    // The framework panes import the built components: each preview script
    // builds the kit first.
    expect(packageJson.scripts.preview).toBe(
      'npm run build && scaffold-ui-kit-preview dev'
    );
    expect(packageJson.scripts['preview:build']).toBe(
      'npm run build && scaffold-ui-kit-preview build'
    );
    expect(packageJson.exports).toEqual({
      './react': './dist/react/index.ts',
      './react/unlinked': './dist/react/unlinked/index.ts',
      './react/unlinked/*': './dist/react/*.tsx',
      './react/*': './dist/react/linked/*.ts',
      './react/*.css': './dist/react/*.css',
      './svelte': './dist/svelte/index.ts',
      './svelte/unlinked': './dist/svelte/unlinked/index.ts',
      './svelte/unlinked/*': './dist/svelte/*',
      './svelte/*': './dist/svelte/linked/*.ts',
      './svelte/*.css': './dist/svelte/*.css',
    });
    expect(readFileSync(join(kitDirectory, '.gitignore'), 'utf8')).toBe(
      'node_modules/\ndist/\n.preview-generated/\n.preview-static/\n'
    );
    expect(readFileSync(join(kitDirectory, 'README.md'), 'utf8')).toContain(
      'npm run preview'
    );
  });

  it('compiles a Tailwind build into the theme of a kit styled with Tailwind', () => {
    const kitDirectory = scaffold({ styling: ['tailwind'] });
    const packageJson = JSON.parse(
      readFileSync(join(kitDirectory, 'package.json'), 'utf8')
    );
    expect(packageJson.devDependencies).toMatchObject({
      '@tailwindcss/cli': '^4.1.0',
      tailwindcss: '^4.1.0',
    });
    expect(Object.keys(packageJson.devDependencies)).toEqual(
      Object.keys(packageJson.devDependencies).sort((a, b) =>
        a.localeCompare(b)
      )
    );
    expect(packageJson.scripts['preview:css']).toBe(
      'tailwindcss --input preview/tailwind.css --output preview/tailwind.generated.css'
    );
    expect(packageJson.scripts.preview).toBe(
      'npm run build && npm run preview:css && scaffold-ui-kit-preview dev'
    );
    expect(packageJson.scripts['preview:build']).toBe(
      'npm run build && npm run preview:css && scaffold-ui-kit-preview build'
    );
    const entry = readFileSync(
      join(kitDirectory, 'preview', 'tailwind.css'),
      'utf8'
    );
    expect(entry).toContain('@import "tailwindcss";');
    expect(entry).toContain('@source "../dist";');
    expect(entry).toContain('@source "./stories";');
    expect(
      (readConfiguration(kitDirectory).preview as { themes: unknown }).themes
    ).toEqual([
      {
        id: 'tailwind',
        label: 'Tailwind',
        css: 'preview/tailwind.generated.css',
      },
    ]);
    expect(readFileSync(join(kitDirectory, '.gitignore'), 'utf8')).toBe(
      'node_modules/\ndist/\n.preview-generated/\n.preview-static/\npreview/tailwind.generated.css\n'
    );
    expect(readFileSync(join(kitDirectory, 'README.md'), 'utf8')).toContain(
      'npm run preview:css -- --watch'
    );
  });

  it('sets up no Tailwind build for a kit without Tailwind, or without the preview', () => {
    const bemKit = scaffold();
    expect(existsSync(join(bemKit, 'preview', 'tailwind.css'))).toBe(false);
    rmSync(parentDirectory, { recursive: true, force: true });
    const unpreviewed = scaffold({
      styling: ['tailwind'],
      includePreview: false,
    });
    expect(existsSync(join(unpreviewed, 'preview'))).toBe(false);
    const packageJson = JSON.parse(
      readFileSync(join(unpreviewed, 'package.json'), 'utf8')
    );
    expect(packageJson.scripts['preview:css']).toBeUndefined();
    expect(packageJson.scripts.preview).toBeUndefined();
    expect(packageJson.scripts['preview:build']).toBeUndefined();
    expect(packageJson.devDependencies.tailwindcss).toBeUndefined();
  });
});
