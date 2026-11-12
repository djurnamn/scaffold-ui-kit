// A shell's page module, loaded in Node: its markup worked out, the files it
// references given addresses, and a module that is no shell page refused by
// name.

import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadShellPage } from '../src/shell-page';
import { defineShellPage, type ShellPage } from '../src/shell';

const hostPage = resolve('/preview/application/index.html');
const pagePath = resolve('/kit/preview/page.ts');

function load(page: unknown, serving = false) {
  return loadShellPage(
    {
      shellPageAbsolute: pagePath,
      importModule: async () => ({ default: page }),
    },
    { hostPage, serving }
  );
}

describe('loadShellPage', () => {
  it('gives nothing for a shell with no page', async () => {
    expect(
      await loadShellPage(
        { importModule: async () => ({}) },
        { hostPage, serving: false }
      )
    ).toBeUndefined();
  });

  it('takes markup as it is, trimmed, and an absent part as empty', async () => {
    expect(await load(defineShellPage({ root: '\n<p>loading</p>\n' }))).toEqual({
      head: '',
      root: '<p>loading</p>',
      assetDirectories: [],
    });
    expect(await load(defineShellPage({}))).toEqual({
      head: '',
      root: '',
      assetDirectories: [],
    });
  });

  it("gives a function the address of each file it references: relative to the page in a build, the file's own path on the development server", async () => {
    const font = resolve('/kit/node_modules/face/fonts/face.woff2');
    const page: ShellPage = {
      head: ({ asset }) => `<link rel="preload" href="${asset(font)}" />`,
      root: async ({ asset }) => `<img src="${asset(font)}" />`,
    };
    expect(await load(page)).toEqual({
      head: '<link rel="preload" href="../../kit/node_modules/face/fonts/face.woff2" />',
      root: '<img src="../../kit/node_modules/face/fonts/face.woff2" />',
      assetDirectories: [join(font, '..')],
    });
    expect((await load(page, true))!.head).toBe(
      `<link rel="preload" href="/@fs${font.split('\\').join('/').replace(/^(?!\/)/, '/')}" />`
    );
  });

  it("encodes each part of a file's path on the development server, so a # or a space in a directory's name stays in the path", async () => {
    const font = resolve('/kits/C# work/my kit/fonts/face 100%.woff2');
    const page: ShellPage = { head: ({ asset }) => asset(font) };
    expect((await load(page, true))!.head).toMatch(
      /^\/@fs\/(?:[A-Za-z]:\/)?kits\/C%23%20work\/my%20kit\/fonts\/face%20100%25\.woff2$/
    );
  });

  it("leaves an @ and a + in a file's path as they are on the development server, which reads neither back from its encoded form", async () => {
    const font = resolve(
      '/kit/node_modules/.pnpm/face@1.0.0_@scope+peer@2.0.0/node_modules/face/fonts/face.woff2'
    );
    const page: ShellPage = { head: ({ asset }) => asset(font) };
    expect((await load(page, true))!.head).toMatch(
      /^\/@fs\/(?:[A-Za-z]:\/)?kit\/node_modules\/\.pnpm\/face@1\.0\.0_@scope\+peer@2\.0\.0\/node_modules\/face\/fonts\/face\.woff2$/
    );
  });

  it('names the module when it cannot be loaded', async () => {
    await expect(
      loadShellPage(
        {
          shellPageAbsolute: pagePath,
          importModule: async () => {
            throw new Error('Unexpected token');
          },
        },
        { hostPage, serving: false }
      )
    ).rejects.toThrow(
      `[preview] The shell page ${pagePath} could not be loaded: Unexpected token`
    );
  });

  it('refuses a module that is no shell page, naming the module and what is wrong', async () => {
    const refused = `[preview] The shell page ${pagePath} `;
    for (const [page, problem] of [
      [
        undefined,
        'must default-export a shell page, as defineShellPage({ head, root }) gives.',
      ],
      [
        'markup',
        'must default-export a shell page, as defineShellPage({ head, root }) gives.',
      ],
      [
        { body: '<p></p>' },
        "has the unknown key 'body'; a shell page takes head and root.",
      ],
      [{ head: 7 }, "has a 'head' that is neither markup nor a function."],
      [{ root: () => 7 }, "has a 'root' function that gave no markup."],
      [
        { head: ({ asset }: { asset: (file: string) => string }) => asset('fonts/face.woff2') },
        'called asset("fonts/face.woff2"); asset takes a file\'s absolute path.',
      ],
    ] as const) {
      await expect(load(page)).rejects.toThrow(refused + problem);
    }
  });
});
