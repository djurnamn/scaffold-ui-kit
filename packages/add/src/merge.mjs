/**
 * Three-way merges through `git merge-file`, the one program the consumer
 * commands run.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Whether `git` is on the path. */
export function hasGit() {
  const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
  return result.error === undefined && result.status === 0;
}

/**
 * Merges the kit's changes into a consumer's edited file, with conflict
 * markers like git's where both changed the same lines.
 *
 * @param {object} versions
 * @param {Buffer | string} versions.ours - The consumer's file.
 * @param {Buffer | string} versions.base - The file as `add` wrote it.
 * @param {Buffer | string} versions.theirs - What `add` writes today.
 * @param {object} labels - The marker labels.
 * @param {string} labels.ours
 * @param {string} labels.base
 * @param {string} labels.theirs
 * @returns {{ content: Buffer, conflicts: number }}
 * @throws When git is not on the path or the merge fails outright.
 */
export function mergeFile({ ours, base, theirs }, labels) {
  const directory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-merge-'));
  try {
    const paths = {
      ours: join(directory, 'ours'),
      base: join(directory, 'base'),
      theirs: join(directory, 'theirs'),
    };
    writeFileSync(paths.ours, ours);
    writeFileSync(paths.base, base);
    writeFileSync(paths.theirs, theirs);
    const result = spawnSync(
      'git',
      [
        'merge-file',
        '-p',
        '-L',
        labels.ours,
        '-L',
        labels.base,
        '-L',
        labels.theirs,
        paths.ours,
        paths.base,
        paths.theirs,
      ],
      { maxBuffer: 64 * 1024 * 1024 }
    );
    if (result.error !== undefined) {
      throw new Error(
        result.error.code === 'ENOENT'
          ? "update merges edited files with git merge-file, and git is not on the path. Install git, or take the kit's version with add <component> --force, or remove a shared file and run add <component> again."
          : `git merge-file failed: ${result.error.message}`
      );
    }
    // The exit status is the number of conflicts; a negative one (above
    // 127 as a status) is an error.
    if (result.status === null || result.status > 127) {
      throw new Error(
        `git merge-file failed: ${result.stderr.toString().trim()}`
      );
    }
    return { content: result.stdout, conflicts: result.status };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
