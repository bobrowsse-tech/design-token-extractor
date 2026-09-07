import fg from 'fast-glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ScanConfig } from './types';

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  contents: string;
}

export async function scanWorkspace(
  workspaceRoot: string,
  config: ScanConfig
): Promise<ScannedFile[]> {
  const matches = await fg(config.include, {
    cwd: workspaceRoot,
    ignore: config.exclude,
    absolute: false,
    onlyFiles: true,
    dot: false,
  });

  const files: ScannedFile[] = [];
  for (const relativePath of matches) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    try {
      const contents = await fs.readFile(absolutePath, 'utf8');
      files.push({ absolutePath, relativePath, contents });
    } catch (err) {
      console.warn(`[design-tokens] Could not read ${relativePath}: ${(err as Error).message}`);
    }
  }
  return files;
}
