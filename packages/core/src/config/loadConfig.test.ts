import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { clusterOccurrences } from '../clustering/cluster';
import { TokenOccurrence } from '../types';
import { DEFAULT_DESIGN_TOKEN_CONFIG, loadConfig, mergeConfig, mergeConfigLayers } from './loadConfig';

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
    expect(config.clustering.minOccurrences).toBe(1);
    expect(config.composites.mode).toBe('whole-value');
    expect(warnings).toEqual([]);
  });

  it('reads minOccurrences and composites.mode from the rc overlay', () => {
    const config = mergeConfig({
      clustering: { minOccurrences: 2 },
      composites: { mode: 'component' },
    });
    expect(config.clustering.minOccurrences).toBe(2);
    expect(config.composites.mode).toBe('component');
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

  it('applies rc over workspace over user over defaults', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dte-config-layers-'));
    dirs.push(dir);
    await writeFile(join(dir, '.designtokenrc.json'), JSON.stringify({
      outputDir: 'from-rc',
      clustering: { colorDeltaE: 0 },
    }));

    const loaded = await loadConfig(dir, {
      user: { outputDir: 'from-user', naming: { prefix: 'user' }, clustering: { colorDeltaE: 5 } },
      workspace: { outputDir: 'from-workspace', naming: { prefix: 'ws' }, clustering: { colorDeltaE: 3 } },
    });

    expect(loaded.config.outputDir).toBe('from-rc');
    expect(loaded.config.naming.prefix).toBe('ws');
    expect(loaded.config.clustering.colorDeltaE).toBe(0);
    expect(loaded.config.clustering.spacingToleranceRem).toBe(DEFAULT_DESIGN_TOKEN_CONFIG.clustering.spacingToleranceRem);
  });
});

describe('mergeConfigLayers', () => {
  it('uses explicit precedence: rc > workspace > user > defaults', () => {
    const config = mergeConfigLayers({
      user: { outputDir: 'from-user', naming: { prefix: 'user' }, clustering: { colorDeltaE: 4 } },
      workspace: { outputDir: 'from-workspace', naming: { prefix: 'ws' } },
      rc: { outputDir: 'from-rc' },
    });

    expect(config.outputDir).toBe('from-rc');
    expect(config.naming.prefix).toBe('ws');
    expect(config.clustering.colorDeltaE).toBe(4);
    expect(config.include).toEqual(DEFAULT_DESIGN_TOKEN_CONFIG.include);
  });

  it('colorDeltaE 0 produces zero fuzzy flags on a fixture that normally has some', () => {
    const occ = (rawValue: string): TokenOccurrence => ({
      file: 'test.css',
      line: 1,
      column: 1,
      selector: '.x',
      property: 'color',
      rawValue,
      fullDeclarationValue: rawValue,
      category: 'color',
    });
    const normallyFlagged = clusterOccurrences([occ('#3B82F6'), occ('#3B82F5')]);
    expect(normallyFlagged.every((cluster) => cluster.requiresApproval)).toBe(true);

    const config = mergeConfigLayers({ workspace: { clustering: { colorDeltaE: 0 } } });
    const clusters = clusterOccurrences([occ('#3B82F6'), occ('#3B82F5')], config.clustering);
    expect(clusters.every((cluster) => !cluster.requiresApproval)).toBe(true);
  });
});
