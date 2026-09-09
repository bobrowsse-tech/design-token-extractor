import { describe, it, expect } from 'vitest';
import { nameClusters, nameSingleValue, semanticNameForCluster } from './nameGenerator';
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

  it('names pure white from the CSS named-color table', () => {
    expect(nameSingleValue('color', '#ffffff')).toBe('color-white');
  });

  it('prefers Tailwind blue-500 over the hue-bucket name for #3B82F6', () => {
    expect(nameSingleValue('color', '#3B82F6')).toBe('color-blue-500');
  });

  it('names spacing by pixel value', () => {
    expect(nameSingleValue('spacing', '16px')).toBe('space-16');
    expect(nameSingleValue('spacing', '1rem')).toBe('space-16');
  });

  it('names transition durations without a regex number parse', () => {
    expect(nameSingleValue('transition', '200ms')).toBe('duration-200ms');
    expect(nameSingleValue('transition', '0.2s')).toBe('duration-0-2s');
    expect(nameSingleValue('transition', 'ease-in-out')).toBe('easing-ease-in-out');
  });

  it('keeps multi-layer shadow and transition names short', () => {
    expect(nameSingleValue(
      'shadow',
      '0 4px 12px rgba(15, 23, 42, 0.18), 0 1px 2px rgba(15, 23, 42, 0.08)'
    )).toBe('shadow-2-layer');
    expect(nameSingleValue(
      'transition',
      'border-color 200ms ease-in-out, box-shadow 200ms ease-in-out'
    )).toBe('transition-2-layer');
    expect(nameSingleValue('shadow', '0 4px 12px rgba(15, 23, 42, 0.18)')).toBe('shadow-4px-12px');
    expect(nameSingleValue('typography', 'fontFamily: Arial; fontSize: 16px; fontWeight: 600')).toBe('typography-16px');
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

  it('applies camel case when configured', () => {
    expect(nameSingleValue('color', '#3B82F6', { case: 'camel' })).toBe('colorBlue500');
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
    expect(forFrequent.name).toBe('color-black');
    expect(forRare.name).toBe('color-black-alt2');
  });
});

describe('semanticNameForCluster', () => {
  it('uses a selector role when the property role is consistent', () => {
    const name = semanticNameForCluster(cluster({
      occurrences: [{
        file: 'a.css', line: 1, column: 1, selector: '.card', property: 'background-color',
        rawValue: '#ffffff', fullDeclarationValue: '#ffffff', category: 'color',
      }],
    }));
    expect(name).toBe('color-background-card');
  });

  it('falls back when the same value is both text and background', () => {
    const name = semanticNameForCluster(cluster({
      canonicalValue: '#ffffff',
      occurrences: [
        {
          file: 'a.css', line: 1, column: 1, selector: '.store-header', property: 'color',
          rawValue: '#ffffff', fullDeclarationValue: '#ffffff', category: 'color',
        },
        {
          file: 'a.css', line: 2, column: 1, selector: '.product-card', property: 'background',
          rawValue: '#ffffff', fullDeclarationValue: '#ffffff', category: 'color',
        },
      ],
    }));
    expect(name).toBeNull();
    const token = nameClusters([cluster({
      canonicalValue: '#ffffff',
      occurrences: [
        {
          file: 'a.css', line: 1, column: 1, selector: '.store-header', property: 'color',
          rawValue: '#ffffff', fullDeclarationValue: '#ffffff', category: 'color',
        },
        {
          file: 'a.css', line: 2, column: 1, selector: '.product-card', property: 'background',
          rawValue: '#ffffff', fullDeclarationValue: '#ffffff', category: 'color',
        },
      ],
    })])[0];
    expect(token.name).toBe('color-white');
    expect(token.semanticName).toBeUndefined();
  });
});
