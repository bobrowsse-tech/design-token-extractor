import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_CONFIG } from '../types';
import { rewriteTokenReferences, rewriteTokenReferencesInWorkspace } from './tokenReferences';
import { applySemanticAlias } from './semanticAliases';
import { applyNameCase, nameClusters, semanticNameForCluster } from '../naming/nameGenerator';
import { TokenCluster, TokenOccurrence, TokensLockFile } from '../types';

describe('rewriteTokenReferences', () => {
  it('rewrites CSS var() and SCSS $ references', () => {
    const css = '.x { color: var(--color-blue-500); } $color-blue-500: #3B82F6;';
    const result = rewriteTokenReferences(css, 'color-blue-500', 'color-brand');
    expect(result.replacedCount).toBe(2);
    expect(result.contents).toContain('var(--color-brand)');
    expect(result.contents).toContain('$color-brand');
    expect(result.contents).not.toContain('color-blue-500');
  });
});

describe('rewriteTokenReferencesInWorkspace', () => {
  let dir = '';

  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  it('does not rewrite a custom outputDir', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dte-rename-'));
    await fs.mkdir(path.join(dir, 'tokens-out'), { recursive: true });
    await fs.writeFile(path.join(dir, 'app.css'), '.x { color: var(--color-old); }\n', 'utf8');
    await fs.writeFile(path.join(dir, 'tokens-out', 'tokens.css'), ':root { --color-old: #fff; }\n', 'utf8');

    const result = await rewriteTokenReferencesInWorkspace(dir, 'color-old', 'color-new', {
      ...DEFAULT_CONFIG,
      include: ['**/*.css'],
      outputDir: 'tokens-out',
    });

    expect(result.replacedCount).toBe(1);
    expect(await fs.readFile(path.join(dir, 'app.css'), 'utf8')).toContain('var(--color-new)');
    expect(await fs.readFile(path.join(dir, 'tokens-out', 'tokens.css'), 'utf8')).toContain('--color-old');
  });
});

describe('semantic aliases', () => {
  it('stores a semantic alias on the lockfile', () => {
    const lock: TokensLockFile = { version: 1, generatedAt: '', entries: [] };
    const next = applySemanticAlias(lock, 'color-blue-500', 'color-background-primary');
    expect(next.semanticAliases?.['color-blue-500']).toBe('color-background-primary');
  });
});

describe('naming cases and semantic names', () => {
  it('converts kebab names', () => {
    expect(applyNameCase('color-blue-500', 'camel')).toBe('colorBlue500');
    expect(applyNameCase('color-blue-500', 'pascal')).toBe('ColorBlue500');
    expect(applyNameCase('color-blue-500', 'snake')).toBe('color_blue_500');
  });

  it('assigns a selector-based semantic name', () => {
    const occ: TokenOccurrence = {
      file: 'a.css', line: 1, column: 1, selector: '.card', property: 'background-color',
      rawValue: '#ffffff', fullDeclarationValue: '#ffffff', category: 'color',
    };
    const cluster: TokenCluster = {
      id: '1', category: 'color', canonicalValue: '#ffffff', memberValues: ['#ffffff'],
      occurrences: [occ], confidence: 1, requiresApproval: false,
    };
    expect(semanticNameForCluster(cluster)).toBe('color-background-card');
    expect(nameClusters([cluster])[0].name).toBe('color-background-card');
  });
});
