import { TokenComposite, TokenOccurrence } from '../types';
import { parseColor } from '../color/colorMath';
import { splitCssNumber } from '../clustering/typoDetection';
import { COLOR_REGEX, LENGTH_REGEX, TIME_REGEX, EASING_REGEX } from './valueClassifier';

export type CompositeMode = 'whole-value' | 'component';

export interface CompositeOptions {
  mode: CompositeMode;
}

export const DEFAULT_COMPOSITE_OPTIONS: CompositeOptions = {
  mode: 'whole-value',
};

export type CompositeTokenKind = 'length' | 'color' | 'keyword' | 'function' | 'string';

export interface CompositeToken {
  raw: string;
  kind: CompositeTokenKind;
}

const COLOR_FUNCTIONS = new Set([
  'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color',
]);

const SHADOW_PROPS = new Set(['box-shadow', 'text-shadow']);

const BORDER_STYLES = new Set([
  'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset',
]);

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
  const lower = value.toLowerCase();
  return lower.includes('var(') || lower.includes('calc(');
}

function readBalancedParens(source: string, start: number): { text: string; next: number } {
  let depth = 0;
  let i = start;
  let text = '';
  while (i < source.length) {
    const ch = source[i];
    text += ch;
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      i += 1;
      if (depth <= 0) return { text, next: i };
      continue;
    }
    i += 1;
  }
  return { text, next: i };
}

function classifyIdentOrFunction(raw: string): CompositeTokenKind {
  const paren = raw.indexOf('(');
  if (paren > 0) {
    const name = raw.slice(0, paren).toLowerCase();
    return COLOR_FUNCTIONS.has(name) ? 'color' : 'function';
  }
  if (parseColor(raw)) return 'color';
  return 'keyword';
}

function classifyNumberToken(raw: string): CompositeTokenKind {
  if (raw === '0' || raw === '0px' || raw === '0rem' || raw === '0em') return 'length';
  const parsed = splitCssNumber(raw);
  if (parsed && parsed.rest !== '') return 'length';
  return 'keyword';
}

/** Depth-0 whitespace split. Functions stay one token. */
export function tokenizeCompositeValue(value: string): CompositeToken[] {
  const tokens: CompositeToken[] = [];
  const source = value.trim();
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ',') {
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let raw = ch;
      i += 1;
      while (i < source.length && source[i] !== quote) {
        raw += source[i];
        i += 1;
      }
      if (i < source.length) {
        raw += source[i];
        i += 1;
      }
      tokens.push({ raw, kind: 'string' });
      continue;
    }
    if (ch === '#') {
      let raw = '#';
      i += 1;
      while (i < source.length && /[0-9a-fA-F]/.test(source[i])) {
        raw += source[i];
        i += 1;
      }
      tokens.push({ raw, kind: parseColor(raw) ? 'color' : 'keyword' });
      continue;
    }
    if ((ch === '-' || ch === '+' || ch === '.') && i + 1 < source.length && /[0-9.]/.test(source[i + 1])) {
      let raw = ch;
      i += 1;
      while (i < source.length && /[0-9.]/.test(source[i])) {
        raw += source[i];
        i += 1;
      }
      while (i < source.length && /[a-zA-Z%]/.test(source[i])) {
        raw += source[i];
        i += 1;
      }
      tokens.push({ raw, kind: classifyNumberToken(raw) });
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let raw = '';
      while (i < source.length && /[0-9.]/.test(source[i])) {
        raw += source[i];
        i += 1;
      }
      while (i < source.length && /[a-zA-Z%]/.test(source[i])) {
        raw += source[i];
        i += 1;
      }
      tokens.push({ raw, kind: classifyNumberToken(raw) });
      continue;
    }
    if (/[a-zA-Z_-]/.test(ch)) {
      let raw = '';
      while (i < source.length && /[a-zA-Z0-9_-]/.test(source[i])) {
        raw += source[i];
        i += 1;
      }
      if (i < source.length && source[i] === '(') {
        const body = readBalancedParens(source, i);
        raw += body.text;
        i = body.next;
      }
      tokens.push({ raw, kind: classifyIdentOrFunction(raw) });
      continue;
    }
    i += 1;
  }
  return tokens;
}

export function normalizeCompositeValue(value: string): string {
  return tokenizeCompositeValue(value).map((token) => {
    if (token.kind === 'color') {
      const parsed = parseColor(token.raw);
      if (!parsed) return token.raw.toLowerCase();
      const hex = `#${[parsed.r, parsed.g, parsed.b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
      return parsed.a < 1 ? `${hex}@${parsed.a}` : hex;
    }
    if (token.kind === 'length') {
      const parsed = splitCssNumber(token.raw);
      if (parsed && parsed.amount === 0) return '0';
      return token.raw.toLowerCase();
    }
    if (token.kind === 'keyword') return token.raw.toLowerCase();
    return token.raw;
  }).join(' ');
}

export function serializeShadowShape(parts: Record<string, string>): string {
  const lengths = [parts.offsetX, parts.offsetY];
  if (parts.blur !== undefined) lengths.push(parts.blur);
  if (parts.spread !== undefined) lengths.push(parts.spread);
  const inset = parts.inset === 'true' ? 'inset ' : '';
  return `${inset}${lengths.join(' ')}`.trim();
}

export function parseShadowLayer(layer: string): TokenComposite | null {
  const trimmed = layer.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none' || hasUnsafeExpr(trimmed)) return null;
  const tokens = tokenizeCompositeValue(trimmed);
  if (tokens.length === 0) return null;

  let inset = false;
  const colors: string[] = [];
  const lengths: string[] = [];
  for (const token of tokens) {
    if (token.kind === 'keyword' && token.raw.toLowerCase() === 'inset') {
      inset = true;
      continue;
    }
    if (token.kind === 'color') {
      colors.push(token.raw);
      continue;
    }
    if (token.kind === 'length') {
      lengths.push(token.raw);
      continue;
    }
    return null;
  }
  if (colors.length !== 1 || lengths.length < 2 || lengths.length > 4) return null;

  const parts: Record<string, string> = {
    offsetX: lengths[0],
    offsetY: lengths[1],
    color: colors[0],
  };
  if (lengths[2] !== undefined) parts.blur = lengths[2];
  if (lengths[3] !== undefined) parts.spread = lengths[3];
  if (inset) parts.inset = 'true';
  return { kind: 'shadow', parts };
}

export function parseAllShadowLayers(value: string): TokenComposite[] | null {
  const layers = splitCommaLayers(value);
  if (layers.length === 0) return null;
  const parsed = layers.map(parseShadowLayer);
  if (parsed.some((layer) => layer === null)) return null;
  return parsed as TokenComposite[];
}

export function expandCompositesForMode(
  occurrences: TokenOccurrence[],
  mode: CompositeMode = 'whole-value'
): TokenOccurrence[] {
  if (mode !== 'component') return occurrences;
  const skip = new Set<string>();
  const extra: TokenOccurrence[] = [];
  const seen = new Map<string, TokenOccurrence>();

  for (const occ of occurrences) {
    if (!SHADOW_PROPS.has(occ.property)) continue;
    const key = `${occ.file}\0${occ.line}\0${occ.column}\0${occ.property}`;
    if (!seen.has(key)) seen.set(key, occ);
  }

  for (const [key, occ] of seen) {
    const layers = parseAllShadowLayers(occ.fullDeclarationValue);
    if (!layers || layers.length === 0) continue;
    skip.add(key);
    for (const layer of layers) {
      const shape = serializeShadowShape(layer.parts);
      const color = layer.parts.color;
      const hint = { layers: layers.length, shape, color };
      extra.push({
        ...occ,
        rawValue: shape,
        category: 'shadow',
        composite: layer,
        compositeRole: 'shadow-shape',
        compositeHint: hint,
      });
      extra.push({
        ...occ,
        rawValue: color,
        fullDeclarationValue: occ.fullDeclarationValue,
        category: 'color',
        composite: undefined,
        compositeRole: 'shadow-color',
        compositeHint: hint,
      });
    }
  }

  const kept = occurrences.filter((occ) => {
    if (!SHADOW_PROPS.has(occ.property)) return true;
    return !skip.has(`${occ.file}\0${occ.line}\0${occ.column}\0${occ.property}`);
  });
  return [...kept, ...extra];
}

function matchColors(value: string): string[] {
  COLOR_REGEX.lastIndex = 0;
  return [...value.matchAll(COLOR_REGEX)].map((m) => m[0]);
}

export function parseShadowComposite(value: string): TokenComposite | null {
  const layers = parseAllShadowLayers(value);
  if (!layers || layers.length === 0) return null;
  if (layers.length === 1) return layers[0];
  return {
    kind: 'shadow',
    parts: { layers: String(layers.length), value: value.trim() },
  };
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

function parseTransitionLayer(layer: string): TokenComposite | null {
  const trimmed = layer.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none' || hasUnsafeExpr(trimmed)) return null;

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

export function parseTransitionComposite(value: string): TokenComposite | null {
  const layers = splitCommaLayers(value.trim());
  if (layers.length === 0) return null;
  const parsed = layers.map(parseTransitionLayer);
  if (parsed.some((layer) => layer === null)) return null;
  if (parsed.length === 1) return parsed[0];
  return {
    kind: 'transition',
    parts: { layers: String(parsed.length), value: value.trim() },
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
