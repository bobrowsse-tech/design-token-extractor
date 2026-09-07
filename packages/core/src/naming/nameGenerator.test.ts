import { describe, it, expect } from 'vitest';
import { nameClusters, nameSingleValue } from './nameGenerator';
import { TokenCluster, TokenOccurrence } from '../types';

function dummyOccurrence(): TokenOccurrence {
  return {
    file: 'a.css',
    line: 1,
    column: 1,
    selector: '.x',
    property: 'color',
    rawValue: '#000',
    fullDeclarationValue: '#000',
    category: 'color',
  };
}

function cluster(partial: Partial<TokenCluster>): TokenCluster {
  return {
    id: 'x', category: 'color', canonicalValue: '#3B82F6', memberValues: ['#3B82F6'],
    occurrences: [], confidence: 1, requiresApproval: false,
    ...partial,
  };
}

describe('nameSingleValue', () => {
  it('names a saturated blue', () => {
    expect(nameSingleValue('color', '#3B82F6')).toBe('color-blue-500');
  });

  it('names pure white as gray-50 (achromatic + very light)', () => {
    expect(nameSingleValue('color', '#ffffff')).toBe('color-gray-50');
  });

  it('names spacing by pixel value', () => {
    expect(nameSingleValue('spacing', '16px')).toBe('space-16');
  });

  it('names an oklch color instead of color-unknown', () => {
    const name = nameSingleValue('color', 'oklch(0.7 0.1 200)');
    expect(name).not.toBe('color-unknown');
    expect(name).toMatch(/^color-[a-z]+-\d+$/);
  });

  it('names opacity from the numeric value', () => {
    expect(nameSingleValue('opacity', '0.85')).toBe('opacity-0-85');
  });

  it('applies a prefix when configured', () => {
    expect(nameSingleValue('color', '#3B82F6', 'ds')).toBe('ds-color-blue-500');
  });
});

describe('nameClusters — collision handling', () => {
  it('gives the more-frequent cluster the clean name and suffixes the rest', () => {
    const frequent = cluster({
      canonicalValue: '#000000',
      occurrences: [dummyOccurrence(), dummyOccurrence(), dummyOccurrence()],
    });
    const rare = cluster({
      canonicalValue: '#010101', // rounds to the same color-gray-950 bucket
      occurrences: [dummyOccurrence()],
    });
    const named = nameClusters([rare, frequent]); // deliberately out of frequency order
    const forFrequent = named.find((t) => t.value === '#000000')!;
    const forRare = named.find((t) => t.value === '#010101')!;
    expect(forFrequent.name).toBe('color-gray-950');
    expect(forRare.name).toBe('color-gray-950-alt2');
  });
});
