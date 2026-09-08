import { describe, it, expect } from 'vitest';
import { clusterOccurrences, detectSpacingScale } from './cluster';
import { TokenOccurrence } from '../types';

function occ(partial: Partial<TokenOccurrence>): TokenOccurrence {
  return {
    file: 'test.css', line: 1, column: 1, selector: '.x', property: 'color',
    rawValue: '#000', fullDeclarationValue: '#000', category: 'color',
    ...partial,
  };
}

describe('clusterOccurrences — exact pass', () => {
  it('groups case-different hex as one exact cluster', () => {
    const clusters = clusterOccurrences([
      occ({ rawValue: '#3B82F6' }),
      occ({ rawValue: '#3b82f6' }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].confidence).toBe(1.0);
    expect(clusters[0].occurrences).toHaveLength(2);
  });

  it('keeps genuinely different colors as separate clusters', () => {
    const clusters = clusterOccurrences([
      occ({ rawValue: '#3B82F6' }),
      occ({ rawValue: '#ff0000' }),
    ]);
    expect(clusters).toHaveLength(2);
  });
});

describe('clusterOccurrences — fuzzy pass (never merges, only flags)', () => {
  it('flags near-identical-but-not-equal colors for approval without merging them', () => {
    const clusters = clusterOccurrences([
      occ({ rawValue: '#3B82F6' }),
      occ({ rawValue: '#3B82F5' }), // 1 unit off, deltaE well under default threshold of 2.0
    ]);
    // Still two separate clusters — fuzzy matches are NEVER auto-merged.
    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => c.requiresApproval)).toBe(true);
    expect(clusters.every((c) => c.confidence < 1.0)).toBe(true);
  });

  it('does not flag near colors when colorDeltaE is 0', () => {
    const clusters = clusterOccurrences([
      occ({ rawValue: '#3B82F6' }),
      occ({ rawValue: '#3B82F5' }),
    ], { colorDeltaE: 0, spacingToleranceRem: 0.01 });
    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => !c.requiresApproval)).toBe(true);
  });

  it('does not flag colors that are clearly different', () => {
    const clusters = clusterOccurrences([
      occ({ rawValue: '#3B82F6' }),
      occ({ rawValue: '#ff0000' }),
    ]);
    expect(clusters.every((c) => !c.requiresApproval)).toBe(true);
  });
});

describe('clusterOccurrences — string normalization', () => {
  it('treats quote-style and whitespace differences as the same font-family', () => {
    const clusters = clusterOccurrences([
      occ({
        category: 'font-family',
        property: 'font-family',
        rawValue: '"Arial",  sans-serif',
        fullDeclarationValue: '"Arial",  sans-serif',
      }),
      occ({
        category: 'font-family',
        property: 'font-family',
        rawValue: "'Arial', sans-serif",
        fullDeclarationValue: "'Arial', sans-serif",
      }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].occurrences).toHaveLength(2);
    expect(clusters[0].confidence).toBe(1);
  });
});

describe('clusterOccurrences — composites', () => {
  it('clusters composite shadows on the full rawValue and never fuzzy-flags them', () => {
    const clusters = clusterOccurrences([
      occ({
        category: 'shadow',
        property: 'box-shadow',
        rawValue: '0 4px 6px rgba(0, 0, 0, 0.1)',
        fullDeclarationValue: '0 4px 6px rgba(0, 0, 0, 0.1)',
        composite: {
          kind: 'shadow',
          parts: { offsetX: '0', offsetY: '4px', blur: '6px', spread: '0', color: 'rgba(0, 0, 0, 0.1)' },
        },
      }),
      occ({
        category: 'shadow',
        property: 'box-shadow',
        rawValue: '0 4px 6px rgba(0, 0, 0, 0.11)',
        fullDeclarationValue: '0 4px 6px rgba(0, 0, 0, 0.11)',
        composite: {
          kind: 'shadow',
          parts: { offsetX: '0', offsetY: '4px', blur: '6px', spread: '0', color: 'rgba(0, 0, 0, 0.11)' },
        },
      }),
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => !c.requiresApproval)).toBe(true);
    expect(clusters.every((c) => c.confidence === 1)).toBe(true);
  });
});

describe('detectSpacingScale', () => {
  it('detects a 4px step scale', () => {
    const clusters = clusterOccurrences([
      occ({ category: 'spacing', property: 'padding', rawValue: '8px' }),
      occ({ category: 'spacing', property: 'padding', rawValue: '16px' }),
      occ({ category: 'spacing', property: 'margin', rawValue: '24px' }),
      occ({ category: 'spacing', property: 'margin', rawValue: '32px' }),
    ]);
    const scale = detectSpacingScale(clusters);
    expect(scale).not.toBeNull();
    expect(scale!.stepRem * 16).toBeCloseTo(4, 5);
  });

  it('returns null with too few distinct spacing values', () => {
    const clusters = clusterOccurrences([
      occ({ category: 'spacing', property: 'padding', rawValue: '8px' }),
    ]);
    expect(detectSpacingScale(clusters)).toBeNull();
  });
});
