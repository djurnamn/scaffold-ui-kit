import { describe, expect, it } from 'vitest';

import { validateProjectName } from '../src/project-name';

describe('validateProjectName', () => {
  it.each(['my-ui-kit', 'kit2', 'a', 'design_system', 'kit.core'])(
    "accepts '%s'",
    (name) => {
      expect(validateProjectName(name)).toBe(true);
    }
  );

  it.each([
    ['', 'required'],
    ['My-Kit', 'lowercase'],
    ['kit space', 'may only contain'],
    ['kit!', 'may only contain'],
    ['-kit', 'cannot start'],
    ['_kit', 'cannot start'],
    ['.kit', 'cannot start'],
    ['a'.repeat(215), 'at most 214'],
    ['node_modules', 'cannot be used'],
    ['build', 'cannot be used'],
    ['init', 'cannot be used'],
  ])("rejects '%s'", (name, messagePart) => {
    const result = validateProjectName(name);
    expect(result).not.toBe(true);
    expect(result).toContain(messagePart);
  });
});
