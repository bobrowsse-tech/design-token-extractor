import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN_TOKEN_CONFIG, loadConfig, mergeConfig } from './loadConfig';

describe('mergeConfig', () => {
  it('returns defaults when no file is present', () => {
    expect(mergeConfig(null)).toEqual(DEFAULT_DESIGN_TOKEN_CONFIG);
  });

  it('overrides include/exclude/outputDir and expands typography', () => {
    const warnings: string[] = [];
    const config = mergeConfig({
      include: ['src/**/*.css'],
      outputDir: 'src/tokens',
      categories: ['color', 'typography', 'zIndex'],
      naming: { prefix: 'ds' },
      clustering: { color: { deltaE: 3 } },
    }, warnings);

    expect(config.include).toEqual(['src/**/*.css']);
    expect(config.outputDir).toBe('src/tokens');
    expect(config.categories).toEqual(expect.arrayContaining([
      'color', 'typography', 'font-family', 'font-size', 'z-index',
    ]));
    expect(config.naming.prefix).toBe('ds');
    expect(config.clustering.colorDeltaE).toBe(3);
    expect(warnings).toEqual([]);
  });

  it('warns on unknown categories and invalid types without throwing', () => {
    const warnings: string[] = [];
    const config = mergeConfig({
      include: 'nope' as unknown as string[],
      categories: ['not-a-category'],
      outputFormats: ['wav'],
    }, warnings);

    expect(config.include).toEqual(DEFAULT_DESIGN_TOKEN_CONFIG.include);
    expect(warnings.some((w) => w.includes('include'))).toBe(true);
    expect(warnings.some((w) => w.includes('not-a-category'))).toBe(true);
    expect(warnings.some((w) => w.includes('wav'))).toBe(true);
  });
});

describe('loadConfig', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('loads .designtokenrc.json from the workspace root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dte-config-'));
    dirs.push(dir);
    await writeFile(join(dir, '.designtokenrc.json'), JSON.stringify({
      outputDir: 'tokens',
      include: ['app/**/*.scss'],
    }));

    const loaded = await loadConfig(dir);
    expect(loaded.source).toBe(join(dir, '.designtokenrc.json'));
    expect(loaded.config.outputDir).toBe('tokens');
    expect(loaded.config.include).toEqual(['app/**/*.scss']);
    expect(loaded.warnings).toEqual([]);
  });

  it('falls back to defaults when the file is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dte-config-missing-'));
    dirs.push(dir);
    const loaded = await loadConfig(dir);
    expect(loaded.source).toBeNull();
    expect(loaded.config).toEqual(DEFAULT_DESIGN_TOKEN_CONFIG);
  });
});
