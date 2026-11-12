// Which files of a templates directory are component templates: the rule the
// kit's build reads them by, so a JSON or JavaScript template gets a story
// as a TypeScript one does, and a declaration file none.

import { describe, expect, it } from 'vitest';
import { isTemplateFile, TEMPLATE_FILE_EXTENSIONS } from '../src/lib/template-files';

describe('isTemplateFile', () => {
  it("reads the extensions the kit's build reads", () => {
    expect([...TEMPLATE_FILE_EXTENSIONS]).toEqual(['.json', '.ts', '.js', '.mjs', '.cjs']);
    for (const file of ['badge.json', 'badge.ts', 'badge.js', 'badge.mjs', 'badge.cjs', '/kit/src/components/theme.toggle.ts'])
      expect(isTemplateFile(file), file).toBe(true);
  });

  it('leaves a declaration file and anything else out', () => {
    for (const file of ['badge.d.ts', 'badge.tsx', 'badge.css', 'badge.story.ts.bak', 'readme.md'])
      expect(isTemplateFile(file), file).toBe(false);
  });
});
