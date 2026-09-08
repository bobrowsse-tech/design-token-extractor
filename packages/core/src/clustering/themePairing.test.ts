import { describe, expect, it } from 'vitest';
import { TokenOccurrence } from '../types';
import { detectThemePairs } from './themePairing';

function occ(partial: Partial<TokenOccurrence>): TokenOccurrence {
  return {
    file: 'theme.css',
    line: 1,
    column: 1,
    selector: '.card',
    property: 'background-color',
    rawValue: '#ffffff',
    fullDeclarationValue: '#ffffff',
    category: 'color',
    ...partial,
  };
}

describe('detectThemePairs', () => {
  it('pairs a unique light/dark selector match as high confidence', () => {
    const pairs = detectThemePairs([
      occ({ selector: '.card', rawValue: '#ffffff' }),
      occ({ selector: '.dark .card', rawValue: '#111111', line: 10 }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].confidence).toBe('high');
    expect(pairs[0].candidateCount).toBe(1);
  });

  it('honours extra dark markers such as .night', () => {
    const pairs = detectThemePairs([
      occ({ selector: '.card', rawValue: '#ffffff' }),
      occ({ selector: '.night .card', rawValue: '#111111', line: 10 }),
    ], ['.night']);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].darkValue).toBe('#111111');
  });

  it('marks ambiguous generic-selector matches as low confidence', () => {
    const pairs = detectThemePairs([
      occ({ selector: '.card', rawValue: '#ffffff', line: 1 }),
      occ({ selector: '.card', rawValue: '#f8f8f8', line: 200, file: 'other.css' }),
      occ({ selector: '.dark .card', rawValue: '#111111', line: 12 }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].confidence).toBe('low');
    expect(pairs[0].candidateCount).toBe(2);
    expect(pairs[0].lightValue).toBe('#ffffff');
  });
});
