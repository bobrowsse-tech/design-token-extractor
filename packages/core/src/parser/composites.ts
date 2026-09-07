import { TokenComposite } from '../types';
import { COLOR_REGEX, LENGTH_REGEX, TIME_REGEX, EASING_REGEX } from './valueClassifier';

const BORDER_STYLES = new Set([
  'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset',
]);

const LENGTH_TOKEN = /^-?\d*\.?\d+(?:px|rem|em|%|vh|vw|ch|ex|pt|pc|in|cm|mm)$/;

export function splitCommaLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      if (current.trim()) layers.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) layers.push(current.trim());
  return layers;
}

function hasUnsafeExpr(value: string): boolean {
  return /\b(?:var|calc)\s*\(/i.test(value);
}

function matchColors(value: string): string[] {
  COLOR_REGEX.lastIndex = 0;
  return [...value.matchAll(COLOR_REGEX)].map((m) => m[0]);
}

function isLengthToken(token: string): boolean {
  return token === '0' || token === '0px' || LENGTH_TOKEN.test(token);
}

export function parseShadowComposite(value: string): TokenComposite | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none' || hasUnsafeExpr(trimmed)) return null;
  const layers = splitCommaLayers(trimmed);
  if (layers.length !== 1) return null;

  const layer = layers[0];
  const colors = matchColors(layer);
  if (colors.length !== 1) return null;

  const inset = /\binset\b/i.test(layer);
  const rest = layer
    .replace(colors[0], ' ')
    .replace(/\binset\b/ig, ' ')
    .trim();
  const lengths = rest.split(/\s+/).filter(Boolean);
  if (lengths.length < 2 || lengths.length > 4 || !lengths.every(isLengthToken)) return null;

  const parts: Record<string, string> = {
    offsetX: lengths[0],
    offsetY: lengths[1],
    blur: lengths[2] ?? '0',
    spread: lengths[3] ?? '0',
    color: colors[0],
  };
  if (inset) parts.inset = 'true';
  return { kind: 'shadow', parts };
}

export function parseBorderComposite(value: string): TokenComposite | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none' || hasUnsafeExpr(trimmed)) return null;
  if (splitCommaLayers(trimmed).length !== 1) return null;

  const colors = matchColors(trimmed);
  if (colors.length !== 1) return null;

  const rest = trimmed.replace(colors[0], ' ');
  LENGTH_REGEX.lastIndex = 0;
  const lengths = rest.match(LENGTH_REGEX) ?? [];
  if (lengths.length !== 1) return null;

  const style = rest.split(/\s+/).map((t) => t.toLowerCase()).find((t) => BORDER_STYLES.has(t));
  if (!style) return null;

  return {
    kind: 'border',
    parts: { width: lengths[0], style, color: colors[0] },
  };
}

export function parseTransitionComposite(value: string): TokenComposite | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none' || hasUnsafeExpr(trimmed)) return null;
  if (splitCommaLayers(trimmed).length !== 1) return null;

  TIME_REGEX.lastIndex = 0;
  const times = trimmed.match(TIME_REGEX) ?? [];
  const duration = times[0];
  if (!duration || times.length > 2) return null;

  EASING_REGEX.lastIndex = 0;
  const easings = trimmed.match(EASING_REGEX) ?? [];
  if (easings.length > 1) return null;

  // CSS defaults an omitted timing-function to ease. An unrecognized
  // function (steps() is matched above; anything else like a custom
  // easing helper) must not be rewritten as ease.
  let remainder = trimmed;
  for (const token of [...times, ...easings]) remainder = remainder.replace(token, ' ');
  if (/\w+\s*\(/.test(remainder)) return null;

  return {
    kind: 'transition',
    parts: {
      duration,
      delay: times[1] ?? '0s',
      timingFunction: easings[0] ?? 'ease',
    },
  };
}

/** Fixed key order so the same type recipe clusters together regardless of
 * declaration order in the stylesheet. */
export const TYPOGRAPHY_PART_ORDER = [
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
] as const;

export function serializeTypographyParts(parts: Record<string, string>): string {
  return TYPOGRAPHY_PART_ORDER
    .filter((key) => parts[key])
    .map((key) => `${key}: ${parts[key]}`)
    .join('; ');
}

/** CSS `font` shorthand. Requires font-size and font-family; otherwise null
 * so generators do not emit a semicolon-separated synthetic string. */
export function typographyToFontShorthand(parts: Record<string, string>): string | null {
  if (!parts.fontSize || !parts.fontFamily) return null;
  const size = parts.lineHeight ? `${parts.fontSize}/${parts.lineHeight}` : parts.fontSize;
  const prefix = parts.fontWeight ? `${parts.fontWeight} ` : '';
  return `${prefix}${size} ${parts.fontFamily}`.trim();
}
