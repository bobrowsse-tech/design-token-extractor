import { describe, expect, it } from 'vitest';
import { computeStableId, createLockFile } from '../lockfile/tokensLock';
import { NamedToken, TokenCluster } from '../types';
import {
  applyDecisionsToLockFile,
  applyReviewMessage,
  buildReviewCards,
  parseReviewMessage,
} from './reviewDecisions';

function token(partial: Partial<NamedToken>): NamedToken {
  return {
    clusterId: computeStableId('color', partial.value ?? '#3B82F6'),
    name: 'color-blue-500',
    category: 'color',
    value: '#3B82F6',
    occurrenceCount: 1,
    fileCount: 1,
    ...partial,
  };
}

describe('applyReviewMessage', () => {
  it('records a merge onto the source cluster', () => {
    const next = applyReviewMessage({}, { type: 'merge', sourceId: 'b', targetId: 'a' });
    expect(next.b).toEqual({ mergedWith: 'a' });
  });

  it('records keep-separate on every id in the group', () => {
    const next = applyReviewMessage({}, { type: 'keep-separate', clusterIds: ['a', 'b', 'c'] });
    expect(next.a?.keptSeparateFrom).toEqual(expect.arrayContaining(['b', 'c']));
    expect(next.b?.keptSeparateFrom).toEqual(expect.arrayContaining(['a', 'c']));
    expect(next.c?.keptSeparateFrom).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('keeps a rename on the decisions record', () => {
    const next = applyReviewMessage({}, { type: 'rename', id: 'a', name: 'color-brand', previousName: 'color-blue-500' });
    expect(next.a).toEqual({ name: 'color-brand', renamedFrom: 'color-blue-500' });
  });

  it('rejects an invalid rename', () => {
    expect(() => applyReviewMessage({}, { type: 'rename', id: 'a', name: '1bad' })).toThrow(/starting with a letter/);
  });
});

describe('applyDecisionsToLockFile', () => {
  it('writes merge and rename onto lock entries', () => {
    const a = token({ value: '#3B82F6' });
    const b = token({ value: '#3B82F5', name: 'color-blue-500-alt2' });
    const lock = createLockFile([a, b]);
    const decisions = applyReviewMessage(
      applyReviewMessage({}, { type: 'merge', sourceId: b.clusterId, targetId: a.clusterId }),
      { type: 'rename', id: a.clusterId, name: 'color-brand', previousName: a.name }
    );
    const next = applyDecisionsToLockFile(lock, decisions, [a, b]);
    expect(next.entries.find((entry) => entry.id === b.clusterId)?.resolution?.mergedWith).toBe(a.clusterId);
    const renamed = next.entries.find((entry) => entry.id === a.clusterId);
    expect(renamed?.name).toBe('color-brand');
    expect(renamed?.resolution?.renamedFrom).toBe('color-blue-500');
  });
});

describe('parseReviewMessage', () => {
  it('accepts known messages and rejects the rest', () => {
    expect(parseReviewMessage({ type: 'merge', sourceId: 'a', targetId: 'b' })).toEqual({
      type: 'merge', sourceId: 'a', targetId: 'b',
    });
    expect(parseReviewMessage({ type: 'keep-separate', clusterIds: ['a', 'b'] })).toEqual({
      type: 'keep-separate', clusterIds: ['a', 'b'],
    });
    expect(parseReviewMessage({ type: 'explode' })).toBeNull();
  });
});

describe('buildReviewCards', () => {
  it('groups related approval clusters and surfaces reference-name cards', () => {
    const idA = computeStableId('color', '#3B82F6');
    const idB = computeStableId('color', '#3B82F5');
    const clusters: TokenCluster[] = [
      {
        id: idA, category: 'color', canonicalValue: '#3B82F6', memberValues: ['#3B82F6'],
        occurrences: [{
          file: 'a.css', line: 1, column: 1, selector: '.x', property: 'color',
          rawValue: '#3B82F6', fullDeclarationValue: '#3B82F6', category: 'color',
        }],
        confidence: 0.8, requiresApproval: true, relatedClusterIds: [idB],
      },
      {
        id: idB, category: 'color', canonicalValue: '#3B82F5', memberValues: ['#3B82F5'],
        occurrences: [{
          file: 'b.css', line: 1, column: 1, selector: '.x', property: 'color',
          rawValue: '#3B82F5', fullDeclarationValue: '#3B82F5', category: 'color',
        }],
        confidence: 0.8, requiresApproval: true, relatedClusterIds: [idA],
      },
    ];
    const tokens = [
      token({
        clusterId: idA,
        referenceMatch: { name: 'blue-500', source: 'tailwind', hex: '#3b82f6', deltaE: 0.2, usedForName: true },
      }),
    ];
    const cards = buildReviewCards(clusters, tokens, null);
    expect(cards.filter((card) => card.kind === 'cluster-group')).toHaveLength(1);
    expect(cards.filter((card) => card.kind === 'reference-name')).toHaveLength(1);
    expect(cards.find((card) => card.kind === 'reference-name')?.token?.referenceLabel).toMatch(/Tailwind blue-500/);
  });

  it('shows below-threshold values as not-yet-clustered cards', () => {
    const id = computeStableId('spacing', '4px');
    const cards = buildReviewCards([
      {
        id,
        category: 'spacing',
        canonicalValue: '4px',
        memberValues: ['4px'],
        occurrences: [{
          file: 'a.css', line: 1, column: 1, selector: '.x', property: 'padding',
          rawValue: '4px', fullDeclarationValue: '4px', category: 'spacing',
        }],
        confidence: 1,
        requiresApproval: false,
        belowThreshold: true,
      },
    ], [], null);
    expect(cards.filter((card) => card.kind === 'below-threshold')).toHaveLength(1);
    expect(cards[0].clusters?.[0].canonicalValue).toBe('4px');
  });
});
