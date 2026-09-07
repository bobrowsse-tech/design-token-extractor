import { describe, it, expect } from 'vitest';
import { computeStableId, createLockFile, reconcileWithLockFile } from './tokensLock';
import { NamedToken } from '../types';

function token(partial: Partial<NamedToken>): NamedToken {
  return { clusterId: '', name: 'color-blue-500', category: 'color', value: '#3B82F6', occurrenceCount: 1, fileCount: 1, ...partial };
}

describe('computeStableId', () => {
  it('is deterministic for the same category+value', () => {
    expect(computeStableId('color', '#3B82F6')).toBe(computeStableId('color', '#3B82F6'));
  });

  it('differs for different values', () => {
    expect(computeStableId('color', '#3B82F6')).not.toBe(computeStableId('color', '#ff0000'));
  });

  it('differs for the same value in a different category', () => {
    expect(computeStableId('color', '16px')).not.toBe(computeStableId('spacing', '16px'));
  });
});

describe('reconcileWithLockFile', () => {
  it('keeps the locked name even if a rescan would have picked a different one', () => {
    const original = token({ name: 'color-blue-500', value: '#3B82F6' });
    const lock = createLockFile([original]);

    // Simulate a rescan where frequency ranking shifted and the naming
    // function would now produce a different name for the same value.
    const rescanned = token({ name: 'color-blue-500-alt2', value: '#3B82F6' });
    const { resolvedTokens, diff } = reconcileWithLockFile([rescanned], lock);

    expect(resolvedTokens[0].name).toBe('color-blue-500'); // locked name wins
    expect(diff.renamed).toHaveLength(1);
    expect(diff.renamed[0]).toMatchObject({ from: 'color-blue-500', to: 'color-blue-500-alt2' });
    expect(diff.unchanged).toBe(1);
  });

  it('reports genuinely new tokens as added', () => {
    const lock = createLockFile([token({ value: '#3B82F6' })]);
    const { diff } = reconcileWithLockFile([token({ value: '#3B82F6' }), token({ value: '#ff0000', name: 'color-red-500' })], lock);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].value).toBe('#ff0000');
  });

  it('reports tokens absent from the new scan as removed', () => {
    const lock = createLockFile([token({ value: '#3B82F6' }), token({ value: '#ff0000', name: 'color-red-500' })]);
    const { diff } = reconcileWithLockFile([token({ value: '#3B82F6' })], lock);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].value).toBe('#ff0000');
  });

  it('works with no existing lockfile (first run)', () => {
    const { diff, resolvedTokens } = reconcileWithLockFile([token({})], null);
    expect(diff.added).toHaveLength(1);
    expect(diff.unchanged).toBe(0);
    expect(resolvedTokens).toHaveLength(1);
  });
});
