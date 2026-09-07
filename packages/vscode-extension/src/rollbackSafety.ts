import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export type GitFileState = 'clean' | 'dirty' | 'untracked' | 'not-git';

export async function isGitRepo(root: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

export async function gitFileState(root: string, filePath: string): Promise<GitFileState> {
  if (!(await isGitRepo(root))) return 'not-git';
  try {
    const relative = path.relative(root, filePath);
    const { stdout } = await execFileAsync('git', ['status', '--porcelain', '--', relative], { cwd: root });
    const line = stdout.trim();
    if (!line) return 'clean';
    if (line.startsWith('??')) return 'untracked';
    return 'dirty';
  } catch {
    return 'not-git';
  }
}

export interface RollbackWarning {
  needed: boolean;
  message: string;
}

/** Warn before rewrite when there is no git safety net for this file. */
export function rollbackWarning(state: GitFileState, documentDirty: boolean): RollbackWarning {
  if (state === 'not-git') {
    return {
      needed: true,
      message: 'No automatic rollback available — this folder is not a git repo. A local snapshot will be kept for "Design Tokens: Undo Last Migration". Continue?',
    };
  }
  if (state === 'dirty' || state === 'untracked' || documentDirty) {
    return {
      needed: true,
      message: 'No automatic rollback available — this file has uncommitted or unsaved changes. A snapshot of the current buffer will be kept for "Design Tokens: Undo Last Migration". Continue?',
    };
  }
  return { needed: false, message: '' };
}
