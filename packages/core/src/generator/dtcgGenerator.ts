import { NamedToken, TokenCategory, TokenComposite } from '../types';
import { toDtcgColorValue } from '../color/colorMath';

// https://www.designtokens.org/tr/2025.10/format/ — $type per group.
const DTCG_TYPE: Record<TokenCategory, string> = {
  color: 'color',
  spacing: 'dimension',
  radius: 'dimension',
  'font-family': 'fontFamily',
  'font-size': 'dimension',
  'font-weight': 'fontWeight',
  'line-height': 'number',
  'letter-spacing': 'dimension',
  shadow: 'shadow',
  'z-index': 'number',
  breakpoint: 'dimension',
  transition: 'duration',
  opacity: 'number',
  border: 'border',
  typography: 'typography',
  unknown: 'other',
};

const EASING_BEZIERS: Record<string, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  linear: [0, 0, 1, 1],
};

type DtcgValue = unknown;

function groupKeyFromName(category: TokenCategory, name: string): string {
  return name.startsWith(`${category}-`) ? name.slice(category.length + 1) : name;
}

function extensionsFor(css: string): Record<string, { css: string }> {
  return { 'design-token-extractor': { css } };
}

function parseDimension(raw: string): { value: number; unit: string } | null {
  const trimmed = raw.trim();
  if (trimmed === '0') return { value: 0, unit: 'px' };
  const m = trimmed.match(/^(-?\d*\.?\d+)([a-z%]+)$/i);
  if (!m) return null;
  const unit = m[2] === 'em' ? 'rem' : m[2];
  return { value: parseFloat(m[1]), unit };
}

function parseDuration(raw: string): { value: number; unit: string } | null {
  const m = raw.trim().match(/^(-?\d*\.?\d+)(ms|s)$/i);
  if (!m) return null;
  return { value: parseFloat(m[1]), unit: m[2].toLowerCase() };
}

function parseNumberish(raw: string): number | string {
  const trimmed = raw.trim();
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d*\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  return trimmed;
}

function parseFontFamily(raw: string): string[] {
  return raw.split(',').map((part) => part.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

function parseTimingFunction(raw: string): [number, number, number, number] | string {
  const trimmed = raw.trim().toLowerCase();
  if (EASING_BEZIERS[trimmed]) return EASING_BEZIERS[trimmed];
  const bezier = trimmed.match(/^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/);
  if (bezier) {
    return [parseFloat(bezier[1]), parseFloat(bezier[2]), parseFloat(bezier[3]), parseFloat(bezier[4])];
  }
  return raw.trim();
}

function colorValue(raw: string): DtcgValue {
  return toDtcgColorValue(raw) ?? raw;
}

function dimensionValue(raw: string): DtcgValue {
  return parseDimension(raw) ?? raw;
}

function durationValue(raw: string): DtcgValue {
  return parseDuration(raw) ?? raw;
}

function lineHeightValue(raw: string): DtcgValue {
  const trimmed = raw.trim();
  if (/^-?\d*\.?\d+$/.test(trimmed)) return parseFloat(trimmed);
  return dimensionValue(trimmed);
}

function fontWeightValue(raw: string): DtcgValue {
  return parseNumberish(raw);
}

function opacityValue(raw: string): DtcgValue {
  const trimmed = raw.trim();
  if (trimmed.endsWith('%')) return parseFloat(trimmed) / 100;
  return parseFloat(trimmed);
}

function compositeValue(composite: TokenComposite): DtcgValue {
  const p = composite.parts;
  switch (composite.kind) {
    case 'shadow':
      if (!p.offsetX || p.layers) return p.value ?? '';
      return {
        color: colorValue(p.color),
        offsetX: dimensionValue(p.offsetX),
        offsetY: dimensionValue(p.offsetY),
        blur: dimensionValue(p.blur ?? '0'),
        spread: dimensionValue(p.spread ?? '0'),
        ...(p.inset === 'true' ? { inset: true } : {}),
      };
    case 'border':
      return {
        color: colorValue(p.color),
        width: dimensionValue(p.width),
        style: p.style,
      };
    case 'transition':
      if (!p.duration || p.layers) return p.value ?? '';
      return {
        duration: durationValue(p.duration),
        delay: durationValue(p.delay ?? '0s'),
        timingFunction: parseTimingFunction(p.timingFunction ?? 'ease'),
      };
    case 'typography': {
      const value: Record<string, unknown> = {};
      if (p.fontFamily) value.fontFamily = parseFontFamily(p.fontFamily);
      if (p.fontSize) value.fontSize = dimensionValue(p.fontSize);
      if (p.fontWeight) value.fontWeight = fontWeightValue(p.fontWeight);
      if (p.lineHeight) value.lineHeight = lineHeightValue(p.lineHeight);
      if (p.letterSpacing) value.letterSpacing = dimensionValue(p.letterSpacing);
      return value;
    }
    default:
      return p;
  }
}

function typedValue(token: NamedToken): { $type: string; $value: DtcgValue } {
  if (token.composite) {
    const type = token.composite.kind === 'transition' ? 'transition' : token.composite.kind;
    return { $type: type, $value: compositeValue(token.composite) };
  }

  switch (token.category) {
    case 'color':
      return { $type: 'color', $value: colorValue(token.value) };
    case 'spacing':
    case 'radius':
    case 'font-size':
    case 'letter-spacing':
    case 'breakpoint':
    case 'shadow':
      return { $type: 'dimension', $value: dimensionValue(token.value) };
    case 'transition':
      if (parseDuration(token.value)) return { $type: 'duration', $value: durationValue(token.value) };
      return { $type: 'cubicBezier', $value: parseTimingFunction(token.value) };
    case 'font-weight':
      return { $type: 'fontWeight', $value: fontWeightValue(token.value) };
    case 'line-height':
      return { $type: /^-?\d*\.?\d+$/.test(token.value.trim()) ? 'number' : 'dimension', $value: lineHeightValue(token.value) };
    case 'font-family':
      return { $type: 'fontFamily', $value: parseFontFamily(token.value) };
    case 'opacity':
    case 'z-index':
      return { $type: 'number', $value: token.category === 'opacity' ? opacityValue(token.value) : parseNumberish(token.value) };
    default:
      return { $type: DTCG_TYPE[token.category] ?? 'other', $value: token.value };
  }
}

export function generateDtcgJson(tokens: NamedToken[]): string {
  const root: Record<string, Record<string, Record<string, unknown>>> = {};

  for (const t of tokens) {
    const group = t.category;
    root[group] ??= {};
    const key = groupKeyFromName(t.category, t.name);
    const typed = typedValue(t);
    root[group][key] = {
      $value: typed.$value,
      $type: typed.$type,
      $description: `Used ${t.occurrenceCount} time(s) across ${t.fileCount} file(s).`,
      $extensions: extensionsFor(t.value),
    };
  }

  return JSON.stringify(root, null, 2) + '\n';
}
