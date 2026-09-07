import { describe, it, expect } from 'vitest';
import { converter, parse } from 'culori';
import { parseColor, contrastRatio, deltaE76, toHsl, toHex, toDtcgColorValue } from './colorMath';

const toCuloriRgb = converter('rgb');

function culoriRgb255(css: string): { r: number; g: number; b: number; a: number } {
  const parsed = parse(css);
  expect(parsed).toBeTruthy();
  const rgb = toCuloriRgb(parsed!);
  expect(rgb).toBeTruthy();
  return {
    r: (rgb!.r ?? 0) * 255,
    g: (rgb!.g ?? 0) * 255,
    b: (rgb!.b ?? 0) * 255,
    a: rgb!.alpha ?? 1,
  };
}

function expectCloseToCulori(css: string) {
  const ours = parseColor(css);
  const theirs = culoriRgb255(css);
  expect(ours).not.toBeNull();
  expect(ours!.r).toBeCloseTo(theirs.r, 0);
  expect(ours!.g).toBeCloseTo(theirs.g, 0);
  expect(ours!.b).toBeCloseTo(theirs.b, 0);
  expect(ours!.a).toBeCloseTo(theirs.a, 2);
}

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

  it('parses modern space-separated rgb with slash alpha', () => {
    const rgb = parseColor('rgb(59 130 246 / 0.5)');
    expect(rgb).toEqual({ r: 59, g: 130, b: 246, a: 0.5 });
  });

  it('parses oklch (culori reference)', () => {
    expect(parseColor('oklch(0.7 0.15 200)')).not.toBeNull();
    // 0.15 chroma at hue 200 is slightly outside sRGB (culori reports a
    // negative red). Use an in-gamut sample for the channel comparison.
    expectCloseToCulori('oklch(0.7 0.1 200)');
    expectCloseToCulori('oklch(0.628 0.188 259.81)');
  });

  it('parses oklab (culori reference)', () => {
    expectCloseToCulori('oklab(0.7 -0.1 0.05)');
  });

  it('parses hsl (culori reference)', () => {
    expectCloseToCulori('hsl(217 91% 60%)');
  });

  it('parses lab (culori reference)', () => {
    expectCloseToCulori('lab(54.3 16.2 -56.5)');
  });

  it('parses lch (culori reference)', () => {
    expectCloseToCulori('lch(54.3 58.8 286)');
  });

  it('parses hwb (culori reference)', () => {
    expectCloseToCulori('hwb(217 23% 4%)');
  });

  it('parses color(srgb …) (culori reference)', () => {
    expectCloseToCulori('color(srgb 0.231 0.510 0.965)');
  });

  it('parses color(display-p3 …) (culori reference)', () => {
    expectCloseToCulori('color(display-p3 0.25 0.50 0.90)');
  });

  it('returns null for unparseable input', () => {
    expect(parseColor('not-a-color')).toBeNull();
    expect(parseColor('color(rec2020 0.2 0.3 0.4)')).toBeNull();
  });
});

describe('toDtcgColorValue', () => {
  it('preserves authored oklch components', () => {
    expect(toDtcgColorValue('oklch(0.7 0.15 200 / 0.8)')).toEqual({
      colorSpace: 'oklch',
      components: [0.7, 0.15, 200],
      alpha: 0.8,
    });
  });

  it('emits sRGB 0–1 floats for hex', () => {
    expect(toDtcgColorValue('#3B82F6')).toEqual({
      colorSpace: 'srgb',
      components: [0.231, 0.51, 0.965],
      alpha: 1,
    });
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

  it('compares an oklch color against a hex color', () => {
    const oklch = parseColor('oklch(0.7 0.15 200)')!;
    const white = parseColor('#ffffff')!;
    const ratio = contrastRatio(oklch, white);
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(21);
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

  it('is small for two near-identical oklch values', () => {
    const a = parseColor('oklch(0.7 0.15 200)')!;
    const b = parseColor('oklch(0.702 0.15 200)')!;
    expect(deltaE76(a, b)).toBeLessThan(2);
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
