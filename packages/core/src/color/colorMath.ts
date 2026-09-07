/**
 * Deliberately zero-dependency. An earlier draft of this project planned to
 * use `culori` for perceptual color distance, but the actual math needed
 * (hex/rgb/hsl/oklch/lab/hwb/color() parsing, sRGB->linear, relative
 * luminance, a CIE76-ish deltaE) is small and stable enough to own
 * directly — one less dependency in the supply chain for a tool that
 * eventually rewrites people's source files.
 * See PUBLISHING-and-SECURITY.md, "keep the dependency list for the rewrite
 * path as small as possible."
 *
 * Color Module 4 conversions are the published CSS / Ottosson formulas.
 * Tests compare RGB output to `culori` (devDependency only).
 */

export interface RGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

export interface DtcgColorValue {
  colorSpace: string;
  components: number[];
  alpha: number;
}

interface ColorFn {
  name: string;
  channels: string[];
  alpha?: string;
}

/** Parses hex, rgb()/rgba(), hsl()/hsla(), oklch()/oklab(), lab()/lch(),
 * hwb(), and color(srgb|display-p3 …). Returns null if unparseable. */
export function parseColor(raw: string): RGB | null {
  const value = raw.trim();

  const hex = parseHex(value);
  if (hex) return hex;

  const fn = splitColorFunction(value);
  if (!fn) return null;

  switch (fn.name) {
    case 'rgb':
    case 'rgba':
      return parseRgbFn(fn);
    case 'hsl':
    case 'hsla':
      return parseHslFn(fn);
    case 'oklch':
      return parseOklchFn(fn);
    case 'oklab':
      return parseOklabFn(fn);
    case 'lab':
      return parseLabFn(fn);
    case 'lch':
      return parseLchFn(fn);
    case 'hwb':
      return parseHwbFn(fn);
    case 'color':
      return parseColorSpaceFn(fn);
    default:
      return null;
  }
}

/**
 * DTCG 2025.10 color object. oklch/oklab keep their authored space and
 * components; everything else is converted to sRGB 0–1 floats.
 */
export function toDtcgColorValue(raw: string): DtcgColorValue | null {
  const value = raw.trim();
  const fn = splitColorFunction(value);
  if (fn?.name === 'oklch' && fn.channels.length >= 3) {
    const L = parseOklchLightness(fn.channels[0]);
    const C = parsePlainNumber(fn.channels[1]);
    const H = parseHue(fn.channels[2]);
    if (L === null || C === null || H === null) return null;
    return {
      colorSpace: 'oklch',
      components: [round3(L), round3(C), round3(H)],
      alpha: resolveAlpha(fn),
    };
  }
  if (fn?.name === 'oklab' && fn.channels.length >= 3) {
    const L = parseOklchLightness(fn.channels[0]);
    const a = parsePlainNumber(fn.channels[1]);
    const b = parsePlainNumber(fn.channels[2]);
    if (L === null || a === null || b === null) return null;
    return {
      colorSpace: 'oklab',
      components: [round3(L), round3(a), round3(b)],
      alpha: resolveAlpha(fn),
    };
  }
  const rgb = parseColor(value);
  if (!rgb) return null;
  return {
    colorSpace: 'srgb',
    components: [round3(rgb.r / 255), round3(rgb.g / 255), round3(rgb.b / 255)],
    alpha: rgb.a,
  };
}

function parseHex(value: string): RGB | null {
  const hexMatch = value.match(/^#([0-9a-fA-F]{3,8})$/);
  if (!hexMatch) return null;
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

function splitColorFunction(raw: string): ColorFn | null {
  const trimmed = raw.trim();
  const open = trimmed.indexOf('(');
  if (open <= 0 || !trimmed.endsWith(')')) return null;
  const name = trimmed.slice(0, open).trim().toLowerCase();
  if (!/^[a-z]+$/.test(name)) return null;
  const inner = trimmed.slice(open + 1, -1).trim();
  if (!inner || /^from\b/i.test(inner)) return null;

  let depth = 0;
  let slash = -1;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === '/' && depth === 0) {
      slash = i;
      break;
    }
  }
  const main = (slash === -1 ? inner : inner.slice(0, slash)).trim();
  const alpha = slash === -1 ? undefined : inner.slice(slash + 1).trim() || undefined;
  const channels = main.includes(',')
    ? main.split(',').map((s) => s.trim()).filter(Boolean)
    : main.split(/\s+/).filter(Boolean);
  return { name, channels, alpha };
}

function resolveAlpha(fn: ColorFn): number {
  if (fn.alpha !== undefined) return parseAlpha(fn.alpha);
  if (fn.channels.length >= 4) return parseAlpha(fn.channels[3]);
  return 1;
}

function parseAlpha(token: string): number {
  const t = token.trim();
  if (t === '' || t === 'none') return 1;
  if (t.endsWith('%')) {
    const n = parseFloat(t);
    return Number.isFinite(n) ? clamp01(n / 100) : 1;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? clamp01(n) : 1;
}

function parseRgbFn(fn: ColorFn): RGB | null {
  if (fn.channels.length < 3) return null;
  const r = parseRgbChannel(fn.channels[0]);
  const g = parseRgbChannel(fn.channels[1]);
  const b = parseRgbChannel(fn.channels[2]);
  if (r === null || g === null || b === null) return null;
  return { r, g, b, a: resolveAlpha(fn) };
}

function parseRgbChannel(token: string): number | null {
  const t = token.trim();
  if (t === 'none') return 0;
  if (t.endsWith('%')) {
    const n = parseFloat(t);
    return Number.isFinite(n) ? clamp255((n / 100) * 255) : null;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.min(255, n) : null;
}

function parseHslFn(fn: ColorFn): RGB | null {
  if (fn.channels.length < 3) return null;
  const h = parseHue(fn.channels[0]);
  const s = parsePercentOrNumber(fn.channels[1], 100);
  const l = parsePercentOrNumber(fn.channels[2], 100);
  if (h === null || s === null || l === null) return null;
  const rgb = hslToRgb(h, s, l);
  return { ...rgb, a: resolveAlpha(fn) };
}

function parseOklchFn(fn: ColorFn): RGB | null {
  if (fn.channels.length < 3) return null;
  const L = parseOklchLightness(fn.channels[0]);
  const C = parsePlainNumber(fn.channels[1]);
  const H = parseHue(fn.channels[2]);
  if (L === null || C === null || H === null) return null;
  const rad = (H * Math.PI) / 180;
  return oklabToSrgb(L, C * Math.cos(rad), C * Math.sin(rad), resolveAlpha(fn));
}

function parseOklabFn(fn: ColorFn): RGB | null {
  if (fn.channels.length < 3) return null;
  const L = parseOklchLightness(fn.channels[0]);
  const a = parsePlainNumber(fn.channels[1]);
  const b = parsePlainNumber(fn.channels[2]);
  if (L === null || a === null || b === null) return null;
  return oklabToSrgb(L, a, b, resolveAlpha(fn));
}

function parseLabFn(fn: ColorFn): RGB | null {
  if (fn.channels.length < 3) return null;
  const L = parsePercentOrNumber(fn.channels[0], 100);
  const a = parsePlainNumber(fn.channels[1]);
  const b = parsePlainNumber(fn.channels[2]);
  if (L === null || a === null || b === null) return null;
  // CSS Color Module 4 Lab is D50. Convert to XYZ D50, Bradford-adapt to
  // D65, then reuse the existing sRGB D65 matrix (inverse of srgbToXyz).
  return xyzToSrgb(d50ToD65(labD50ToXyz([L, a, b])), resolveAlpha(fn));
}

function parseLchFn(fn: ColorFn): RGB | null {
  if (fn.channels.length < 3) return null;
  const L = parsePercentOrNumber(fn.channels[0], 100);
  const C = parsePlainNumber(fn.channels[1]);
  const H = parseHue(fn.channels[2]);
  if (L === null || C === null || H === null) return null;
  const rad = (H * Math.PI) / 180;
  return xyzToSrgb(
    d50ToD65(labD50ToXyz([L, C * Math.cos(rad), C * Math.sin(rad)])),
    resolveAlpha(fn)
  );
}

function parseHwbFn(fn: ColorFn): RGB | null {
  if (fn.channels.length < 3) return null;
  const h = parseHue(fn.channels[0]);
  const w = parsePercentOrNumber(fn.channels[1], 100);
  const b = parsePercentOrNumber(fn.channels[2], 100);
  if (h === null || w === null || b === null) return null;
  const W = w / 100;
  const B = b / 100;
  if (W + B >= 1) {
    const gray = (W / (W + B)) * 255;
    return { r: gray, g: gray, b: gray, a: resolveAlpha(fn) };
  }
  const rgb = hslToRgb(h, 100, 50);
  const factor = 1 - W - B;
  return {
    r: rgb.r * factor + W * 255,
    g: rgb.g * factor + W * 255,
    b: rgb.b * factor + W * 255,
    a: resolveAlpha(fn),
  };
}

function parseColorSpaceFn(fn: ColorFn): RGB | null {
  if (fn.channels.length < 4) return null;
  const space = fn.channels[0].toLowerCase();
  const r = parseUnitInterval(fn.channels[1]);
  const g = parseUnitInterval(fn.channels[2]);
  const b = parseUnitInterval(fn.channels[3]);
  if (r === null || g === null || b === null) return null;
  const a = fn.alpha !== undefined ? parseAlpha(fn.alpha) : 1;
  if (space === 'srgb') {
    return { r: r * 255, g: g * 255, b: b * 255, a };
  }
  if (space === 'display-p3') {
    // display-p3 → sRGB is a documented gamut-map approximation for
    // clustering/contrast only: convert P3 (same transfer as sRGB) through
    // XYZ D65, then clip encoded sRGB to 0–255. Not colorimetrically exact
    // for out-of-sRGB-gamut P3 colors.
    const lr = srgbToLinearChannel(r * 255);
    const lg = srgbToLinearChannel(g * 255);
    const lb = srgbToLinearChannel(b * 255);
    const x = lr * 0.4865709 + lg * 0.2656677 + lb * 0.1982173;
    const y = lr * 0.2289746 + lg * 0.6917385 + lb * 0.0792869;
    const z = lr * 0.0000000 + lg * 0.0451134 + lb * 1.0439444;
    return xyzToSrgb([x, y, z], a);
  }
  return null;
}

/** Ottosson OKLab → linear sRGB → encoded sRGB. */
function oklabToSrgb(L: number, a: number, b: number, alpha: number): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return {
    r: linearToSrgbChannel(lr),
    g: linearToSrgbChannel(lg),
    b: linearToSrgbChannel(lb),
    a: alpha,
  };
}

function parseHue(token: string): number | null {
  const t = token.trim().toLowerCase();
  if (t === 'none') return 0;
  if (t.endsWith('deg')) return parseFinite(t);
  if (t.endsWith('rad')) {
    const n = parseFinite(t);
    return n === null ? null : (n * 180) / Math.PI;
  }
  if (t.endsWith('turn')) {
    const n = parseFinite(t);
    return n === null ? null : n * 360;
  }
  if (t.endsWith('grad')) {
    const n = parseFinite(t);
    return n === null ? null : n * 0.9;
  }
  return parseFinite(t);
}

function parseOklchLightness(token: string): number | null {
  const t = token.trim();
  if (t === 'none') return 0;
  if (t.endsWith('%')) {
    const n = parseFloat(t);
    return Number.isFinite(n) ? n / 100 : null;
  }
  return parsePlainNumber(t);
}

function parsePercentOrNumber(token: string, percentScale: number): number | null {
  const t = token.trim();
  if (t === 'none') return 0;
  if (t.endsWith('%')) {
    const n = parseFloat(t);
    return Number.isFinite(n) ? (n / 100) * percentScale : null;
  }
  return parsePlainNumber(t);
}

function parseUnitInterval(token: string): number | null {
  const t = token.trim();
  if (t === 'none') return 0;
  if (t.endsWith('%')) {
    const n = parseFloat(t);
    return Number.isFinite(n) ? n / 100 : null;
  }
  return parsePlainNumber(t);
}

function parsePlainNumber(token: string): number | null {
  const t = token.trim();
  if (t === 'none') return 0;
  if (!/^-?\d*\.?\d+$/.test(t)) return null;
  return parseFinite(t);
}

function parseFinite(token: string): number | null {
  const n = parseFloat(token);
  return Number.isFinite(n) ? n : null;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp01(s / 100);
  const lit = clamp01(l / 100);
  const c = (1 - Math.abs(2 * lit - 1)) * sat;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = lit - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

function srgbToLinear(c: number): number {
  return srgbToLinearChannel(c);
}

function srgbToLinearChannel(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgbChannel(linear: number): number {
  const v = linear <= 0.0031308
    ? 12.92 * linear
    : 1.055 * Math.pow(Math.abs(linear), 1 / 2.4) * Math.sign(linear) - 0.055;
  return clamp255(v * 255);
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

/** CIE Lab (D50, CSS Color Module 4) → XYZ D50. Same piecewise f⁻¹ as xyzToLab. */
function labD50ToXyz([L, a, bb]: [number, number, number]): [number, number, number] {
  const xn = 0.96422, yn = 1.0, zn = 0.82521;
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - bb / 200;
  const finv = (t: number) => {
    const t3 = t * t * t;
    return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
  };
  return [xn * finv(fx), yn * finv(fy), zn * finv(fz)];
}

/** Bradford chromatic adaptation, D50 → D65 (CSS Color Module 4). */
function d50ToD65([x, y, z]: [number, number, number]): [number, number, number] {
  return [
    x * 0.9555766 + y * -0.0230393 + z * 0.0631636,
    x * -0.0282895 + y * 1.0099416 + z * 0.0210077,
    x * 0.0122982 + y * -0.0204830 + z * 1.3299098,
  ];
}

/** Inverse of srgbToXyz, then encode + clip to 0–255. */
function xyzToSrgb([x, y, z]: [number, number, number], alpha: number): RGB {
  const lr = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const lg = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
  const lb = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return {
    r: linearToSrgbChannel(lr),
    g: linearToSrgbChannel(lg),
    b: linearToSrgbChannel(lb),
    a: alpha,
  };
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

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, n));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
