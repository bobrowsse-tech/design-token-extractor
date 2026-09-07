import { describe, expect, it } from 'vitest';
import { rollbackWarning } from './rollbackSafety';

describe('rollbackWarning', () => {
  it('warns when the folder is not a git repo', () => {
    const warning = rollbackWarning('not-git', false);
    expect(warning.needed).toBe(true);
    expect(warning.message).toMatch(/not a git repo/);
  });

  it('warns when the file has uncommitted or unsaved changes', () => {
    expect(rollbackWarning('dirty', false).needed).toBe(true);
    expect(rollbackWarning('clean', true).needed).toBe(true);
    expect(rollbackWarning('untracked', false).needed).toBe(true);
  });

  it('does not warn when git is clean and the buffer is saved', () => {
    expect(rollbackWarning('clean', false)).toEqual({ needed: false, message: '' });
  });
});
