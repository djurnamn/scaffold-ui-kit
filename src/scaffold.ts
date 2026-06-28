import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';

import {
  configurationFileName,
  type KitConfiguration,
  type StylingName,
  type TargetName,
} from './configuration';

/** The choices an `init` run scaffolds a kit from. */
export interface ScaffoldOptions {
  /** The kit's package name, also its consumer command. */
  projectName: string;
  /** The directory the kit directory is created inside. */
  parentDirectory: string;
  /** The targets every component is built for. */
  targets: TargetName[];
  /** Styling extensions applied to every build, in application order. */
  styling: StylingName[];
  /** Whether the example components are included. */
  includeExamples: boolean;
}

const packageRoot = join(__dirname, '..');
const assetsDirectory = join(packageRoot, 'assets');

/**
 * Scaffolds a kit project directory.
 *
 * @param options - The scaffold choices.
 * @returns The created file paths, relative to the kit directory.
 */
export function scaffoldKit(options: ScaffoldOptions): string[] {
  const kitDirectory = join(options.parentDirectory, options.projectName);
  if (existsSync(kitDirectory) && readdirSync(kitDirectory).length > 0) {
    throw new Error(
      `Directory '${kitDirectory}' already exists and is not empty`
    );
  }

  const createdFiles: string[] = [];
  const writeKitFile = (relativePath: string, content: string): void => {
    const filePath = join(kitDirectory, relativePath);
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(filePath, content);
    createdFiles.push(relativePath);
  };

  writeKitFile('package.json', kitPackageJson(options));
  writeKitFile(configurationFileName, kitConfigurationFile(options));
  writeKitFile('tsconfig.json', kitTsconfig());
  writeKitFile('.gitignore', 'node_modules/\ndist/\n');
  writeKitFile('README.md', kitReadme(options));

  mkdirSync(join(kitDirectory, 'src', 'components'), { recursive: true });
  mkdirSync(join(kitDirectory, 'bin'), { recursive: true });
  copyFileSync(
    join(assetsDirectory, 'bin', 'add.mjs'),
    join(kitDirectory, 'bin', 'add.mjs')
  );
  createdFiles.push(join('bin', 'add.mjs'));

  if (options.includeExamples) {
    for (const exampleFile of readdirSync(
      join(assetsDirectory, 'components')
    )) {
      const targetPath = join(kitDirectory, 'src', 'components', exampleFile);
      copyFileSync(join(assetsDirectory, 'components', exampleFile), targetPath);
      createdFiles.push(relative(kitDirectory, targetPath));
    }
  }

  return createdFiles;
}

function ownVersion(): string {
  const { version } = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8')
  ) as { version: string };
  return version;
}

function kitPackageJson(options: ScaffoldOptions): string {
  const version = ownVersion();
  return `${JSON.stringify(
    {
      name: options.projectName,
      version: '0.1.0',
      description: `${options.projectName} - a UI kit built with scaffold-ui-kit`,
      type: 'module',
      bin: { [options.projectName]: './bin/add.mjs' },
      files: [
        'bin',
        'dist',
        'src/components',
        configurationFileName,
        'README.md',
      ],
      scripts: {
        build: 'scaffold-ui-kit build',
        prepublishOnly: 'npm run build',
      },
      keywords: ['ui-kit', 'component-library', ...options.targets],
      devDependencies: {
        '@js-template-engine/types': `^${version}`,
        'scaffold-ui-kit': `^${version}`,
        typescript: '^5.3.3',
      },
    },
    null,
    2
  )}\n`;
}

function kitConfigurationFile(options: ScaffoldOptions): string {
  const configuration: KitConfiguration = {
    name: options.projectName,
    targets: options.targets,
    styling: options.styling,
  };
  return `${JSON.stringify(configuration, null, 2)}\n`;
}

function kitTsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2020',
        module: 'esnext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ['src/**/*'],
    },
    null,
    2
  )}\n`;
}

function kitReadme(options: ScaffoldOptions): string {
  const targetList = options.targets.map((target) => `- ${target}`).join('\n');
  return `# ${options.projectName}

A UI kit built with [scaffold-ui-kit](https://www.npmjs.com/package/scaffold-ui-kit):
components are defined once as data templates in \`src/components/\` and
built for every configured target.

## Targets

${targetList}

## Development

\`\`\`bash
npm install        # install scaffold-ui-kit and the template types
npm run build      # render every template into dist/<target>/
\`\`\`

Add components by creating template files in \`src/components/\` - see the
existing templates for the format. Targets and styling are configured in
\`${configurationFileName}\`.

## Publishing

\`\`\`bash
npm publish
\`\`\`

The published package ships the built \`dist/\` output and a consumer CLI.

## Consumer usage

\`\`\`bash
npx ${options.projectName} add                              # interactive
npx ${options.projectName} add button --target ${options.targets[0]}
npx ${options.projectName} add --list
\`\`\`

\`add\` copies the built component files into the consumer's project
(\`./src/components/ui\` by default; override with \`--output-directory\`).
`;
}
