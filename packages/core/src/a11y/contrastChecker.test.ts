import { describe, expect, it } from 'vitest';
import { TokenOccurrence } from '../types';
import { checkContrast, isPlausibleAncestorSelector } from './contrastChecker';

function occ(partial: Partial<TokenOccurrence>): TokenOccurrence {
  return {
    file: 'a.css',
    line: 1,
    column: 1,
    selector: '.card',
    property: 'color',
    rawValue: '#111111',
    fullDeclarationValue: '#111111',
    category: 'color',
    ...partial,
  };
}

describe('checkContrast', () => {
  it('pairs foreground and background on the same selector', () => {
    const findings = checkContrast([
      occ({ property: 'color', rawValue: '#111111' }),
      occ({ property: 'background-color', rawValue: '#ffffff' }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].pairing).toBe('same-selector');
    expect(findings[0].passesAA).toBe(true);
  });

  it('pairs a child foreground with an ancestor background (BEM / descendant)', () => {
    const findings = checkContrast([
      occ({ selector: '.card', property: 'background-color', rawValue: '#ffffff' }),
      occ({ selector: '.card__title', property: 'color', rawValue: '#767676', line: 4 }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].pairing).toBe('ancestor');
    expect(findings[0].selector).toBe('.card__title');
  });

  it('composites semi-transparent foreground over the background', () => {
    const findings = checkContrast([
      occ({ property: 'color', rawValue: 'rgba(0, 0, 0, 0.5)' }),
      occ({ property: 'background-color', rawValue: '#ffffff' }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ratio).toBeGreaterThan(1);
    expect(findings[0].ratio).toBeLessThan(4.5);
  });

  it('pairs a child background with an inherited ancestor color', () => {
    const findings = checkContrast([
      occ({ selector: '.card', property: 'color', rawValue: '#111111' }),
      occ({ selector: '.card__panel', property: 'background-color', rawValue: '#ffffff', line: 6 }),
    ]);
    expect(findings.some((f) => f.pairing === 'inherited')).toBe(true);
  });

  it('falls back to a document background', () => {
    const findings = checkContrast([
      occ({ selector: 'body', property: 'background-color', rawValue: '#ffffff' }),
      occ({ selector: '.lonely', property: 'color', rawValue: '#767676', line: 8 }),
    ]);
    expect(findings.some((f) => f.pairing === 'document')).toBe(true);
  });
});

describe('isPlausibleAncestorSelector', () => {
  it('accepts BEM and descendant forms', () => {
    expect(isPlausibleAncestorSelector('.card', '.card__title')).toBe(true);
    expect(isPlausibleAncestorSelector('.card', '.card .title')).toBe(true);
    expect(isPlausibleAncestorSelector('.card', '.other')).toBe(false);
  });
});
