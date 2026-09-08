import { describe, it, expect } from 'vitest';
import { computeStableId, createLockFile, reconcileWithLockFile, renameLockEntry } from './tokensLock';
import { applyDecisionsToLockFile, applyReviewMessage } from '../review/reviewDecisions';
import { NamedToken, TokenCluster, TokenOccurrence } from '../types';

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

  it('keeps a human rename from renameLockEntry on the next reconcile', () => {
    const original = token({ name: 'color-blue-500', value: '#3B82F6' });
    const lock = renameLockEntry(createLockFile([original]), computeStableId('color', '#3B82F6'), 'color-brand');
    const { resolvedTokens } = reconcileWithLockFile([token({ name: 'color-blue-500', value: '#3B82F6' })], lock);
    expect(resolvedTokens[0].name).toBe('color-brand');
  });

  it('a merge decision persists through a second reconcile without re-flagging', () => {
    const valueA = '#3B82F6';
    const valueB = '#3B82F5';
    const idA = computeStableId('color', valueA);
    const idB = computeStableId('color', valueB);
    const occurrence = (value: string, file: string): TokenOccurrence => ({
      file, line: 1, column: 1, selector: '.x', property: 'color',
      rawValue: value, fullDeclarationValue: value, category: 'color',
    });
    const clusters: TokenCluster[] = [
      {
        id: idA, category: 'color', canonicalValue: valueA, memberValues: [valueA],
        occurrences: [occurrence(valueA, 'a.css')], confidence: 0.8, requiresApproval: true,
        relatedClusterIds: [idB],
      },
      {
        id: idB, category: 'color', canonicalValue: valueB, memberValues: [valueB],
        occurrences: [occurrence(valueB, 'b.css')], confidence: 0.8, requiresApproval: true,
        relatedClusterIds: [idA],
      },
    ];
    const tokens = [
      token({ clusterId: idA, name: 'color-blue-500', value: valueA }),
      token({ clusterId: idB, name: 'color-blue-500-alt2', value: valueB }),
    ];
    const decisions = applyReviewMessage({}, { type: 'merge', sourceId: idB, targetId: idA });
    const lock = applyDecisionsToLockFile(createLockFile(tokens), decisions, tokens);

    const first = reconcileWithLockFile(tokens, lock, clusters);
    expect(first.resolvedClusters.every((cluster) => !cluster.requiresApproval)).toBe(true);
    expect(first.resolvedTokens).toHaveLength(1);
    expect(first.resolvedTokens[0].value).toBe(valueA);
    expect(first.mergedLock.entries.some((entry) => entry.id === idB && entry.resolution?.mergedWith === idA)).toBe(true);

    const second = reconcileWithLockFile(tokens, first.mergedLock, clusters);
    expect(second.resolvedClusters.every((cluster) => !cluster.requiresApproval)).toBe(true);
    expect(second.resolvedTokens).toHaveLength(1);
    expect(second.mergedLock.entries.some((entry) => entry.resolution?.mergedWith === idA)).toBe(true);
  });
});
