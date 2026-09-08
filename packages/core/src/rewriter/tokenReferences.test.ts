import { describe, expect, it } from 'vitest';
import { rewriteTokenReferences } from './tokenReferences';
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
