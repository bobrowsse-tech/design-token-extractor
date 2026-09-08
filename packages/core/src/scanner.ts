import fg from 'fast-glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ScanConfig, TokenOccurrence } from './types';

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  contents: string;
  mtimeMs: number;
  size: number;
  reused?: boolean;
}

export interface ScanCacheFile {
  mtimeMs: number;
  size: number;
  occurrences: TokenOccurrence[];
}

export interface ScanCache {
  version: 2;
  include: string[];
  exclude: string[];
  files: Record<string, ScanCacheFile>;
}

export const SCAN_CACHE_FILENAME = '.designtokens-scan-cache.json';
export const SCAN_CACHE_VERSION = 2;

export function generatedOutputExcludes(outputDir?: string): string[] {
  const normalized = (outputDir ?? 'design-tokens').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
  if (!normalized) return ['.designtokens-backup/**'];
  return [`${normalized}/**`, '.designtokens-backup/**'];
}

export function effectiveExclude(config: ScanConfig): string[] {
  return [...new Set([...config.exclude, ...generatedOutputExcludes(config.outputDir)])];
}

export function cacheFingerprintMatches(cache: ScanCache | null | undefined, config: ScanConfig): boolean {
  if (!cache || cache.version !== SCAN_CACHE_VERSION) return false;
  return JSON.stringify(cache.include) === JSON.stringify(config.include)
    && JSON.stringify(cache.exclude) === JSON.stringify(effectiveExclude(config));
}

export async function loadScanCache(workspaceRoot: string): Promise<ScanCache | null> {
  try {
    const raw = await fs.readFile(path.join(workspaceRoot, SCAN_CACHE_FILENAME), 'utf8');
    return JSON.parse(raw) as ScanCache;
  } catch {
    return null;
  }
}

export async function writeScanCache(workspaceRoot: string, cache: ScanCache): Promise<void> {
  await fs.writeFile(path.join(workspaceRoot, SCAN_CACHE_FILENAME), JSON.stringify(cache, null, 2), 'utf8');
}

export async function scanWorkspace(
  workspaceRoot: string,
  config: ScanConfig,
  cache?: ScanCache | null
): Promise<{ files: ScannedFile[]; reusedCount: number }> {
  const matches = await fg(config.include, {
    cwd: workspaceRoot,
    ignore: effectiveExclude(config),
    absolute: false,
    onlyFiles: true,
    dot: false,
  });

  const usable = cacheFingerprintMatches(cache, config) ? cache : null;
  const files: ScannedFile[] = [];
  let reusedCount = 0;

  for (const relativePath of matches) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    try {
      const stat = await fs.stat(absolutePath);
      const cached = usable?.files[relativePath];
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        files.push({
          absolutePath,
          relativePath,
          contents: '',
          mtimeMs: stat.mtimeMs,
          size: stat.size,
          reused: true,
        });
        reusedCount++;
        continue;
      }
      const contents = await fs.readFile(absolutePath, 'utf8');
      files.push({
        absolutePath,
        relativePath,
        contents,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      });
    } catch (err) {
      console.warn(`[design-tokens] Could not read ${relativePath}: ${(err as Error).message}`);
    }
  }
  return { files, reusedCount };
}
