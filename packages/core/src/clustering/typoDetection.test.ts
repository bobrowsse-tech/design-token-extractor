import { describe, expect, it } from 'vitest';
import { extractFromSource } from '../parser/extractor';
import { TokenOccurrence } from '../types';
import { detectProbableTypos, isEscapeHatchZIndex } from './typoDetection';

function occ(partial: Partial<TokenOccurrence>): TokenOccurrence {
  return {
    file: 'test.css',
    line: 1,
    column: 1,
    selector: '.x',
    property: 'font-size',
    rawValue: '16px',
    fullDeclarationValue: '16px',
    category: 'font-size',
    ...partial,
  };
}

function many(value: string, count: number, extra: Partial<TokenOccurrence> = {}): TokenOccurrence[] {
  return Array.from({ length: count }, (_, i) => occ({
    rawValue: value,
    fullDeclarationValue: value,
    line: i + 1,
    ...extra,
  }));
}

describe('detectProbableTypos', () => {
  it('flags a rare breakpoint sitting next to a common standard value', () => {
    const findings = detectProbableTypos([
      ...many('768px', 40, { category: 'breakpoint', property: '@media', selector: '@media (min-width: 768px)' }),
      occ({
        category: 'breakpoint',
        property: '@media',
        selector: '@media (min-width: 771px)',
        rawValue: '771px',
        fullDeclarationValue: '(min-width: 771px)',
      }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      suspectValue: '771px',
      suspectCount: 1,
      likelyIntended: '768px',
      likelyIntendedCount: 40,
      reason: 'both',
    });
  });

  it('does not flag two common nearby values as a typo', () => {
    const findings = detectProbableTypos([
      ...many('14px', 12, { category: 'font-size', property: 'font-size' }),
      ...many('16px', 20, { category: 'font-size', property: 'font-size' }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it('flags a rare font-size next to a standard step even if the standard is absent', () => {
    const findings = detectProbableTypos([
      occ({ category: 'font-size', property: 'font-size', rawValue: '21px', fullDeclarationValue: '21px' }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].suspectValue).toBe('21px');
    expect(findings[0].likelyIntended).toBe('20px');
    expect(findings[0].reason).toBe('standard-value');
  });

  it('does not flag a same-selector responsive override across a media query', () => {
    const css = `
.card { padding: 16px 24px; font-size: 15px; }
@media (min-width: 768px) {
  .card { padding: 24px 32px; font-size: 16px; }
}
`;
    const occurrences = extractFromSource('responsive.css', 'responsive.css', css);
    const findings = detectProbableTypos(occurrences);
    expect(findings.some((f) => f.category === 'font-size')).toBe(false);
  });

  it('does not treat z-index 9999 as a typo-style outlier', () => {
    expect(isEscapeHatchZIndex('9999')).toBe(true);
    expect(isEscapeHatchZIndex('99999')).toBe(true);
    expect(isEscapeHatchZIndex('8')).toBe(false);
    const findings = detectProbableTypos([
      occ({ category: 'z-index', property: 'z-index', rawValue: '10', fullDeclarationValue: '10' }),
      occ({ category: 'z-index', property: 'z-index', rawValue: '9999', fullDeclarationValue: '9999' }),
    ]);
    expect(findings).toHaveLength(0);
  });
});
