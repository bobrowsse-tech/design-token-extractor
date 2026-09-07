import { describe, expect, it } from 'vitest';
import { parseColor } from './colorMath';
import { findClosestReferenceColor, tokenNameFromReference } from './referencePalette';

describe('findClosestReferenceColor', () => {
  it('matches Tailwind blue-500 exactly', () => {
    const rgb = parseColor('#3B82F6');
    expect(rgb).not.toBeNull();
    const match = findClosestReferenceColor(rgb!);
    expect(match).toMatchObject({
      name: 'blue-500',
      source: 'tailwind',
      usedForName: true,
    });
    expect(match!.deltaE).toBe(0);
    expect(tokenNameFromReference(match!)).toBe('color-blue-500');
  });

  it('matches CSS named white exactly', () => {
    const rgb = parseColor('#ffffff');
    const match = findClosestReferenceColor(rgb!);
    expect(match?.name).toBe('white');
    expect(match?.source).toBe('css-named');
    expect(match?.usedForName).toBe(true);
  });
});
