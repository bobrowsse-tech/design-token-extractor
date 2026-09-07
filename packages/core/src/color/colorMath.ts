/**
 * Deliberately zero-dependency. An earlier draft of this project planned to
 * use `culori` for perceptual color distance, but the actual math needed
 * (hex/rgb parsing, sRGB->linear, relative luminance, a CIE76-ish deltaE) is
 * small and stable enough to own directly — one less dependency in the
 * supply chain for a tool that eventually rewrites people's source files.
 * See PUBLISHING-and-SECURITY.md, "keep the dependency list for the rewrite
 * path as small as possible."
 */

export interface RGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

/** Parses hex (#fff, #ffffff, #ffffff00) or rgb()/rgba() strings. Returns null if unparseable
 * (e.g. hsl()/oklch() — those are rarer in the wild and left as a Phase-next TODO). */
export function parseColor(raw: string): RGB | null {
  const value = raw.trim();

  const hexMatch = value.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length !== 6 && hex.length !== 8) return null;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  const rgbMatch = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (rgbMatch) {
    return {
      r: Math.min(255, parseFloat(rgbMatch[1])),
      g: Math.min(255, parseFloat(rgbMatch[2])),
      b: Math.min(255, parseFloat(rgbMatch[3])),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  return null;
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance, 0 (black) to 1 (white). Ignores alpha —
 * callers should composite against a background first if alpha < 1. */
export function relativeLuminance(rgb: RGB): number {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1 (no contrast) to 21 (black vs white). */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// --- Lab conversion + deltaE76, for perceptual "are these two colors close
// enough to be the same token" clustering. deltaE76 is the simplest CIE
// formula; it's not as perceptually uniform as deltaE2000, but it's a few
// lines of well-known math instead of a dependency, and is more than good
// enough for "is this an accidental near-duplicate of a brand color".

function srgbToXyz(rgb: RGB): [number, number, number] {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  // sRGB D65 matrix
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
  return [x, y, z];
}

function xyzToLab([x, y, z]: [number, number, number]): [number, number, number] {
  // D65 reference white
  const xn = 0.95047, yn = 1.0, zn = 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116);
  const fx = f(x / xn), fy = f(y / yn), fz = f(z / zn);
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bb = 200 * (fy - fz);
  return [L, a, bb];
}

export function toLab(rgb: RGB): [number, number, number] {
  return xyzToLab(srgbToXyz(rgb));
}

/** CIE76 deltaE. Rule of thumb: <1 imperceptible, <2 barely perceptible on
 * close inspection, <10 perceptible at a glance, >10 clearly different. */
export function deltaE76(a: RGB, b: RGB): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

export interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export function toHsl(rgb: RGB): HSL {
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
    case g: h = ((b - r) / d + 2); break;
    default: h = ((r - g) / d + 4); break;
  }
  h *= 60;
  return { h, s: s * 100, l: l * 100 };
}

export function toHex(rgb: RGB): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const hex = (n: number) => clamp(n).toString(16).padStart(2, '0');
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`.toLowerCase();
}
