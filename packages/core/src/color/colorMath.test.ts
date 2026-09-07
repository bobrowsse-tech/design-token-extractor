import { describe, it, expect } from 'vitest';
import { parseColor, contrastRatio, deltaE76, toHsl, toHex } from './colorMath';

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#3B82F6')).toEqual({ r: 59, g: 130, b: 246, a: 1 });
  });

  it('expands 3-digit hex', () => {
    expect(parseColor('#FFF')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  it('parses rgba with alpha', () => {
    expect(parseColor('rgba(0, 0, 0, 0.1)')).toEqual({ r: 0, g: 0, b: 0, a: 0.1 });
  });

  it('returns null for unparseable input', () => {
    expect(parseColor('oklch(0.7 0.15 200)')).toBeNull();
  });
});

describe('contrastRatio (WCAG 2.x)', () => {
  it('black on white is the maximum, 21:1', () => {
    const black = parseColor('#000000')!;
    const white = parseColor('#ffffff')!;
    expect(contrastRatio(black, white)).toBeCloseTo(21, 0);
  });

  it('is symmetric regardless of argument order', () => {
    const a = parseColor('#3B82F6')!;
    const b = parseColor('#ffffff')!;
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 5);
  });

  it('white on the blue used in the fixture fails AA (< 4.5)', () => {
    const blue = parseColor('#3B82F6')!;
    const white = parseColor('#ffffff')!;
    expect(contrastRatio(white, blue)).toBeLessThan(4.5);
  });
});

describe('deltaE76', () => {
  it('is zero for identical colors', () => {
    const a = parseColor('#3B82F6')!;
    expect(deltaE76(a, a)).toBeCloseTo(0, 5);
  });

  it('is small for visually near-identical colors', () => {
    const a = parseColor('#3B82F6')!;
    const b = parseColor('#3B82F5')!; // off by one in the blue channel
    expect(deltaE76(a, b)).toBeLessThan(1);
  });

  it('is large for clearly different colors', () => {
    const red = parseColor('#ff0000')!;
    const green = parseColor('#00ff00')!;
    expect(deltaE76(red, green)).toBeGreaterThan(50);
  });
});

describe('toHsl / toHex round trip', () => {
  it('identifies pure white as achromatic with 100% lightness', () => {
    const hsl = toHsl(parseColor('#ffffff')!);
    expect(hsl.s).toBeCloseTo(0, 5);
    expect(hsl.l).toBeCloseTo(100, 5);
  });

  it('toHex normalizes case', () => {
    expect(toHex(parseColor('#FFF')!)).toBe('#ffffff');
  });
});
