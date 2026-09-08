import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_CONFIG, TokenCategory } from './types';
import { scanAndExtract } from './pipeline';
import { SCAN_CACHE_FILENAME } from './scanner';
import { workspaceRootFromBackupDir } from './rewriter/backup';

describe('incremental scan cache', () => {
  let dir = '';

  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  it('reuses unchanged files on a second scan', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dte-scan-'));
    await fs.writeFile(path.join(dir, 'a.css'), '.x { color: #111111; }\n', 'utf8');
    const config = { ...DEFAULT_CONFIG, include: ['**/*.css'] };

    const first = await scanAndExtract(dir, config);
    expect(first.reusedFileCount).toBe(0);
    expect(first.occurrences.some((item) => item.rawValue === '#111111')).toBe(true);

    const second = await scanAndExtract(dir, config);
    expect(second.reusedFileCount).toBe(1);
    expect(second.occurrences.some((item) => item.rawValue === '#111111')).toBe(true);

    const cacheRaw = await fs.readFile(path.join(dir, SCAN_CACHE_FILENAME), 'utf8');
    expect(JSON.parse(cacheRaw).files['a.css']).toBeDefined();
  });

  it('reuses unfiltered cache after categories are added', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dte-scan-cat-'));
    await fs.writeFile(path.join(dir, 'a.css'), '.card { color: #111111; padding: 16px; }\n', 'utf8');
    const colorOnly = { ...DEFAULT_CONFIG, include: ['**/*.css'], categories: ['color'] as TokenCategory[] };

    const first = await scanAndExtract(dir, colorOnly);
    expect(first.reusedFileCount).toBe(0);
    expect(first.occurrences.some((item) => item.rawValue === '16px')).toBe(false);

    const second = await scanAndExtract(dir, { ...DEFAULT_CONFIG, include: ['**/*.css'] });
    expect(second.reusedFileCount).toBe(1);
    expect(second.occurrences.some((item) => item.rawValue === '#111111')).toBe(true);
    expect(second.occurrences.some((item) => item.rawValue === '16px')).toBe(true);
  });

  it('does not re-extract generated token files under outputDir', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dte-scan-out-'));
    await fs.mkdir(path.join(dir, 'design-tokens'), { recursive: true });
    await fs.writeFile(path.join(dir, 'app.css'), '.x { color: #111111; }\n', 'utf8');
    await fs.writeFile(path.join(dir, 'design-tokens', '_color.scss'), '$space-2: 2px;\n', 'utf8');

    const result = await scanAndExtract(dir, { ...DEFAULT_CONFIG, outputDir: 'design-tokens' });
    expect(result.occurrences.some((item) => item.rawValue === '#111111')).toBe(true);
    expect(result.occurrences.some((item) => item.rawValue === '2px')).toBe(false);
  });
});

describe('workspaceRootFromBackupDir', () => {
  it('walks up from stamp → .designtokens-backup → workspace', () => {
    expect(workspaceRootFromBackupDir('/tmp/app/.designtokens-backup/2026-01-01')).toBe('/tmp/app');
  });
});
