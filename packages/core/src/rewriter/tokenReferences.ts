import * as fs from 'fs/promises';
import { scanWorkspace } from '../scanner';
import { DEFAULT_CONFIG, ScanConfig } from '../types';
import { indexOfBoundedLiteral } from './boundedLiteral';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Rewrite `var(--old)` / `$old` references after a lockfile rename. */
export function rewriteTokenReferences(contents: string, oldName: string, newName: string): {
  contents: string;
  replacedCount: number;
} {
  const css = new RegExp(`var\\(\\s*--${escapeRegExp(oldName)}\\s*\\)`, 'g');
  const scss = new RegExp(`\\$${escapeRegExp(oldName)}\\b`, 'g');
  let replacedCount = 0;
  const next = contents
    .replace(css, () => {
      replacedCount += 1;
      return `var(--${newName})`;
    })
    .replace(scss, () => {
      replacedCount += 1;
      return `$${newName}`;
    });
  return { contents: next, replacedCount };
}

export async function rewriteTokenReferencesInWorkspace(
  workspaceRoot: string,
  oldName: string,
  newName: string,
  scanConfig: ScanConfig = DEFAULT_CONFIG
): Promise<{ filesWritten: string[]; replacedCount: number }> {
  const { files } = await scanWorkspace(workspaceRoot, scanConfig, null);
  const filesWritten: string[] = [];
  let replacedCount = 0;
  for (const file of files) {
    const contents = file.contents || await fs.readFile(file.absolutePath, 'utf8');
    const result = rewriteTokenReferences(contents, oldName, newName);
    if (result.replacedCount === 0) continue;
    await fs.writeFile(file.absolutePath, result.contents, 'utf8');
    filesWritten.push(file.relativePath);
    replacedCount += result.replacedCount;
  }
  return { filesWritten, replacedCount };
}

export function uniqueSubstringReplace(haystack: string, needle: string, replacement: string): string | null {
  const index = indexOfBoundedLiteral(haystack, needle, 0);
  if (index === -1) return null;
  if (indexOfBoundedLiteral(haystack, needle, index + needle.length) !== -1) return null;
  return haystack.slice(0, index) + replacement + haystack.slice(index + needle.length);
}
