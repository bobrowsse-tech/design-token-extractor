import { TokenOccurrence, TokenCategory } from '../types';
import { offsetToLineCol } from './parseStylesheet';

export type StylesheetExtractor = (filePath: string, relativePath: string, contents: string) => TokenOccurrence[];

const STYLE_BLOCK_RE = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
const INLINE_STYLE_RE = /<([a-zA-Z][\w-]*)([^>]*?)\sstyle\s*=\s*(["'])([\s\S]*?)\3/gi;
const CLASS_ATTR_RE = /(?:class|className)\s*=\s*(["'`])([^"'`]*?)\1/g;
const CLASS_TEMPLATE_RE = /(?:class|className)\s*=\s*\{?\s*(["'`])([^"'`]*?)\1/g;

const CSS_IN_JS_RE = /(?:styled(?:\.\w+|\([^)]*\))|css|createGlobalStyle)\s*`([\s\S]*?)`/g;

const TAILWIND_COLOR = /(?:^|[\s"'`])((?:bg|text|border|outline|fill|stroke|from|to|via|decoration|accent|caret|ring)-\[((?:#(?:[0-9a-fA-F]{3,8})|(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\([^)]*\)))\])/g;
const TAILWIND_LENGTH = /(?:^|[\s"'`])((?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|w|h|min-w|max-w|min-h|max-h|inset|top|right|bottom|left|rounded|border|indent|text|leading|tracking)-\[(-?\d*\.?\d+(?:px|rem|em|%|vh|vw|ch))\])/g;

const COLOR_PREFIXES = new Set(['bg', 'text', 'border', 'outline', 'fill', 'stroke', 'from', 'to', 'via', 'decoration', 'accent', 'caret', 'ring']);

function categoryForTailwindPrefix(prefix: string): TokenCategory {
  if (prefix === 'text') return 'font-size';
  if (prefix === 'leading') return 'line-height';
  if (prefix === 'tracking') return 'letter-spacing';
  if (prefix === 'rounded') return 'radius';
  return 'spacing';
}

function classSelectorFromAttrs(attrs: string): string {
  const match = /\bclass(?:Name)?\s*=\s*["']([^"']+)["']/.exec(attrs);
  if (!match) return '(inline-style)';
  const first = match[1].trim().split(/\s+/)[0];
  return first ? `.${first}` : '(inline-style)';
}

export function extractTailwindArbitrary(
  contents: string,
  relativePath: string,
  selector = '(class)',
  origin?: { text: string; offset: number }
): TokenOccurrence[] {
  const source = origin?.text ?? contents;
  const base = origin?.offset ?? 0;
  const occurrences: TokenOccurrence[] = [];
  TAILWIND_COLOR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAILWIND_COLOR.exec(contents)) !== null) {
    const loc = offsetToLineCol(source, base + match.index);
    const prefix = match[1].split('-')[0];
    occurrences.push({
      file: relativePath,
      line: loc.line,
      column: loc.column,
      selector,
      property: COLOR_PREFIXES.has(prefix) ? (prefix === 'text' ? 'color' : prefix === 'bg' ? 'background-color' : prefix) : 'color',
      rawValue: match[2],
      fullDeclarationValue: match[1],
      category: 'color',
    });
  }
  TAILWIND_LENGTH.lastIndex = 0;
  while ((match = TAILWIND_LENGTH.exec(contents)) !== null) {
    const loc = offsetToLineCol(source, base + match.index);
    const prefix = match[1].split('-')[0];
    const category = categoryForTailwindPrefix(prefix);
    occurrences.push({
      file: relativePath,
      line: loc.line,
      column: loc.column,
      selector,
      property: prefix,
      rawValue: match[2],
      fullDeclarationValue: match[1],
      category,
    });
  }
  return occurrences;
}

export function extractCssInJs(
  contents: string,
  relativePath: string,
  extractStylesheet: StylesheetExtractor
): TokenOccurrence[] {
  const occurrences: TokenOccurrence[] = [];
  CSS_IN_JS_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CSS_IN_JS_RE.exec(contents)) !== null) {
    const css = match[1];
    const extracted = extractStylesheet(`${relativePath}.css`, relativePath, css);
    const start = offsetToLineCol(contents, match.index);
    for (const occ of extracted) {
      occurrences.push({
        ...occ,
        line: occ.line + start.line - 1,
        selector: occ.selector === '(root)' ? '(css-in-js)' : occ.selector,
      });
    }
  }
  return occurrences;
}

export function extractInlineStyles(
  contents: string,
  relativePath: string,
  extractStylesheet: StylesheetExtractor
): TokenOccurrence[] {
  const occurrences: TokenOccurrence[] = [];
  INLINE_STYLE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_STYLE_RE.exec(contents)) !== null) {
    const tag = match[1];
    const attrs = match[2] ?? '';
    const css = match[4];
    const selector = classSelectorFromAttrs(`${attrs} `) === '(inline-style)'
      ? tag
      : classSelectorFromAttrs(`${attrs} `);
    const wrapped = `${selector} { ${css} }`;
    const extracted = extractStylesheet(`${relativePath}.css`, relativePath, wrapped);
    const start = offsetToLineCol(contents, match.index);
    for (const occ of extracted) {
      occurrences.push({ ...occ, line: occ.line + start.line - 1 });
    }
  }
  return occurrences;
}

export function extractVueSfc(
  contents: string,
  relativePath: string,
  extractStylesheet: StylesheetExtractor
): TokenOccurrence[] {
  const occurrences: TokenOccurrence[] = [];
  STYLE_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = STYLE_BLOCK_RE.exec(contents)) !== null) {
    const attrs = match[1] ?? '';
    const css = match[2];
    const lang = /\blang\s*=\s*["']?(scss|sass|less)/i.exec(attrs)?.[1]?.toLowerCase() ?? 'css';
    const virtual = `${relativePath}.${lang}`;
    const extracted = extractStylesheet(virtual, relativePath, css);
    const start = offsetToLineCol(contents, match.index + match[0].indexOf(css));
    for (const occ of extracted) {
      occurrences.push({ ...occ, line: occ.line + start.line - 1 });
    }
  }
  occurrences.push(...extractInlineStyles(contents, relativePath, extractStylesheet));
  occurrences.push(...extractCssInJs(contents, relativePath, extractStylesheet));
  const seenClassSpans = new Set<string>();
  for (const re of [CLASS_ATTR_RE, CLASS_TEMPLATE_RE]) {
    re.lastIndex = 0;
    while ((match = re.exec(contents)) !== null) {
      const valueOffset = match.index + match[0].indexOf(match[2]);
      const spanKey = `${valueOffset}:${match[2]}`;
      if (seenClassSpans.has(spanKey)) continue;
      seenClassSpans.add(spanKey);
      occurrences.push(...extractTailwindArbitrary(match[2], relativePath, '(class)', {
        text: contents,
        offset: valueOffset,
      }));
    }
  }
  return occurrences;
}

export function extractFromMarkup(
  contents: string,
  relativePath: string,
  extractStylesheet: StylesheetExtractor
): TokenOccurrence[] {
  return [
    ...extractInlineStyles(contents, relativePath, extractStylesheet),
    ...extractTailwindArbitrary(contents, relativePath),
  ];
}

export function extractFromScript(
  contents: string,
  relativePath: string,
  extractStylesheet: StylesheetExtractor
): TokenOccurrence[] {
  return [
    ...extractCssInJs(contents, relativePath, extractStylesheet),
    ...extractTailwindArbitrary(contents, relativePath),
  ];
}
