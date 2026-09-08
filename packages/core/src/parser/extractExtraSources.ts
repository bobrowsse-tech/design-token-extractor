import { TokenOccurrence, TokenCategory } from '../types';
import { offsetToLineCol } from './parseStylesheet';

export type StylesheetExtractor = (filePath: string, relativePath: string, contents: string) => TokenOccurrence[];

const COLOR_PREFIXES = new Set(['bg', 'text', 'border', 'outline', 'fill', 'stroke', 'from', 'to', 'via', 'decoration', 'accent', 'caret', 'ring']);
const LENGTH_PREFIXES = new Set([
  'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl',
  'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml',
  'gap', 'w', 'h', 'min-w', 'max-w', 'min-h', 'max-h',
  'inset', 'top', 'right', 'bottom', 'left',
  'rounded', 'border', 'indent', 'text', 'leading', 'tracking',
]);
const COLOR_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'oklch', 'oklab', 'lab', 'lch', 'hwb', 'color']);

function categoryForTailwindPrefix(prefix: string): TokenCategory {
  if (prefix === 'text') return 'font-size';
  if (prefix === 'leading') return 'line-height';
  if (prefix === 'tracking') return 'letter-spacing';
  if (prefix === 'rounded') return 'radius';
  return 'spacing';
}

function isSpace(char: string | undefined): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function isIdentChar(char: string | undefined): boolean {
  return !!char && /[A-Za-z0-9_$]/.test(char);
}

function isPrefixChar(char: string | undefined): boolean {
  return !!char && /[A-Za-z-]/.test(char);
}

function identEndingAt(text: string, end: number): string {
  if (end < 0 || !isIdentChar(text[end])) return '';
  let start = end;
  while (start >= 0 && isIdentChar(text[start])) start--;
  return text.slice(start + 1, end + 1);
}

function classSelectorFromAttrs(attrs: string): string {
  let from = 0;
  while (from < attrs.length) {
    const idx = attrs.indexOf('class', from);
    if (idx === -1) return '(inline-style)';
    if (idx > 0 && isIdentChar(attrs[idx - 1])) {
      from = idx + 5;
      continue;
    }
    const name = attrs.startsWith('Name', idx + 5) ? 'className' : 'class';
    let j = idx + name.length;
    while (j < attrs.length && isSpace(attrs[j])) j++;
    if (attrs[j] !== '=') {
      from = idx + 5;
      continue;
    }
    j++;
    while (j < attrs.length && isSpace(attrs[j])) j++;
    const quote = attrs[j];
    if (quote !== '"' && quote !== "'") {
      from = j;
      continue;
    }
    const end = attrs.indexOf(quote, j + 1);
    if (end === -1) return '(inline-style)';
    const first = attrs.slice(j + 1, end).trim().split(/\s+/)[0];
    return first ? `.${first}` : '(inline-style)';
  }
  return '(inline-style)';
}

function isHexColor(value: string): boolean {
  if (value.length < 4 || value[0] !== '#') return false;
  const hex = value.slice(1);
  if (hex.length !== 3 && hex.length !== 4 && hex.length !== 6 && hex.length !== 8) return false;
  for (let i = 0; i < hex.length; i++) {
    const c = hex.charCodeAt(i);
    const isDigit = c >= 48 && c <= 57;
    const isUpper = c >= 65 && c <= 70;
    const isLower = c >= 97 && c <= 102;
    if (!isDigit && !isUpper && !isLower) return false;
  }
  return true;
}

function isColorFunction(value: string): boolean {
  const open = value.indexOf('(');
  if (open <= 0 || !value.endsWith(')')) return false;
  return COLOR_FUNCTIONS.has(value.slice(0, open).toLowerCase());
}

function isLengthValue(value: string): boolean {
  if (!value) return false;
  let i = 0;
  if (value[0] === '-') i = 1;
  let digits = 0;
  let dots = 0;
  while (i < value.length && ((value.charCodeAt(i) >= 48 && value.charCodeAt(i) <= 57) || value[i] === '.')) {
    if (value[i] === '.') {
      dots += 1;
      if (dots > 1) return false;
    } else {
      digits += 1;
    }
    i += 1;
  }
  if (digits === 0) return false;
  const unit = value.slice(i);
  return unit === 'px' || unit === 'rem' || unit === 'em' || unit === '%' || unit === 'vh' || unit === 'vw' || unit === 'ch';
}

interface ArbitraryMatch {
  start: number;
  prefix: string;
  value: string;
  utility: string;
}

function eachArbitraryUtility(contents: string, accept: (prefix: string, value: string) => boolean): ArbitraryMatch[] {
  const matches: ArbitraryMatch[] = [];
  let from = 0;
  while (from < contents.length) {
    const open = contents.indexOf('-[', from);
    if (open === -1) break;
    const close = contents.indexOf(']', open + 2);
    if (close === -1) break;
    let start = open;
    while (start > 0 && isPrefixChar(contents[start - 1])) start--;
    const before = start === 0 ? '' : contents[start - 1];
    if (start > 0 && before !== ' ' && before !== '\t' && before !== '\n' && before !== '\r' && before !== '"' && before !== "'" && before !== '`') {
      from = open + 2;
      continue;
    }
    const prefix = contents.slice(start, open);
    const value = contents.slice(open + 2, close);
    if (prefix && accept(prefix, value)) {
      matches.push({ start, prefix, value, utility: contents.slice(start, close + 1) });
    }
    from = close + 1;
  }
  return matches;
}

function isCssInJsTagBefore(text: string, tick: number): boolean {
  let j = tick - 1;
  while (j >= 0 && isSpace(text[j])) j--;
  if (j < 0) return false;

  if (text[j] === ')') {
    let depth = 1;
    j -= 1;
    while (j >= 0 && depth > 0) {
      if (text[j] === ')') depth += 1;
      else if (text[j] === '(') depth -= 1;
      j -= 1;
    }
    return identEndingAt(text, j) === 'styled';
  }

  const ident = identEndingAt(text, j);
  if (ident === 'css' || ident === 'createGlobalStyle') return true;
  if (!ident) return false;
  const beforeIdent = j - ident.length;
  if (beforeIdent >= 0 && text[beforeIdent] === '.') {
    return identEndingAt(text, beforeIdent - 1) === 'styled';
  }
  return false;
}

function eachStyleBlock(contents: string): { attrs: string; css: string; cssOffset: number }[] {
  const blocks: { attrs: string; css: string; cssOffset: number }[] = [];
  const lower = contents.toLowerCase();
  let from = 0;
  while (from < contents.length) {
    const start = lower.indexOf('<style', from);
    if (start === -1) break;
    if (start > 0 && isIdentChar(contents[start - 1])) {
      from = start + 6;
      continue;
    }
    const afterName = start + 6;
    if (afterName < contents.length && isIdentChar(contents[afterName])) {
      from = afterName;
      continue;
    }
    const tagEnd = contents.indexOf('>', afterName);
    if (tagEnd === -1) break;
    const close = lower.indexOf('</style>', tagEnd + 1);
    if (close === -1) break;
    blocks.push({
      attrs: contents.slice(afterName, tagEnd),
      css: contents.slice(tagEnd + 1, close),
      cssOffset: tagEnd + 1,
    });
    from = close + 8;
  }
  return blocks;
}

function eachInlineStyle(contents: string): { tag: string; attrs: string; css: string; index: number }[] {
  const found: { tag: string; attrs: string; css: string; index: number }[] = [];
  let from = 0;
  while (from < contents.length) {
    const idx = contents.indexOf('style', from);
    if (idx === -1) break;
    if (idx > 0 && (isIdentChar(contents[idx - 1]) || contents[idx - 1] === '-')) {
      from = idx + 5;
      continue;
    }
    if (idx + 5 < contents.length && (isIdentChar(contents[idx + 5]) || contents[idx + 5] === '-')) {
      from = idx + 5;
      continue;
    }
    let j = idx + 5;
    while (j < contents.length && isSpace(contents[j])) j++;
    if (contents[j] !== '=') {
      from = idx + 5;
      continue;
    }
    j += 1;
    while (j < contents.length && isSpace(contents[j])) j++;
    const quote = contents[j];
    if (quote !== '"' && quote !== "'") {
      from = j;
      continue;
    }
    const end = contents.indexOf(quote, j + 1);
    if (end === -1) break;
    const tagStart = contents.lastIndexOf('<', idx);
    if (tagStart === -1 || contents.slice(tagStart, idx).includes('>')) {
      from = end + 1;
      continue;
    }
    const nameStart = tagStart + 1;
    if (!/[A-Za-z]/.test(contents[nameStart] ?? '')) {
      from = end + 1;
      continue;
    }
    let nameEnd = nameStart + 1;
    while (nameEnd < idx && /[\w-]/.test(contents[nameEnd] ?? '')) nameEnd += 1;
    found.push({
      tag: contents.slice(nameStart, nameEnd),
      attrs: contents.slice(nameEnd, idx),
      css: contents.slice(j + 1, end),
      index: idx,
    });
    from = end + 1;
  }
  return found;
}

function eachClassAttribute(contents: string): { value: string; offset: number }[] {
  const found: { value: string; offset: number }[] = [];
  const seen = new Set<string>();
  for (const name of ['className', 'class']) {
    let from = 0;
    while (from < contents.length) {
      const idx = contents.indexOf(name, from);
      if (idx === -1) break;
      if (idx > 0 && isIdentChar(contents[idx - 1])) {
        from = idx + name.length;
        continue;
      }
      if (name === 'class' && contents.startsWith('Name', idx + 5)) {
        from = idx + 5;
        continue;
      }
      let j = idx + name.length;
      while (j < contents.length && isSpace(contents[j])) j++;
      if (contents[j] !== '=') {
        from = idx + name.length;
        continue;
      }
      j += 1;
      while (j < contents.length && isSpace(contents[j])) j++;
      if (contents[j] === '{') {
        j += 1;
        while (j < contents.length && isSpace(contents[j])) j++;
      }
      const quote = contents[j];
      if (quote !== '"' && quote !== "'" && quote !== '`') {
        from = Math.max(j, idx + name.length);
        continue;
      }
      let end = j + 1;
      while (end < contents.length && contents[end] !== '"' && contents[end] !== "'" && contents[end] !== '`') {
        end += 1;
      }
      if (end >= contents.length || contents[end] !== quote) {
        from = idx + name.length;
        continue;
      }
      const value = contents.slice(j + 1, end);
      const offset = j + 1;
      const key = `${offset}:${value}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ value, offset });
      }
      from = end + 1;
    }
  }
  return found;
}

function eachCssInJsBlock(contents: string): { css: string; index: number }[] {
  const blocks: { css: string; index: number }[] = [];
  let from = 0;
  while (from < contents.length) {
    const tick = contents.indexOf('`', from);
    if (tick === -1) break;
    if (!isCssInJsTagBefore(contents, tick)) {
      from = tick + 1;
      continue;
    }
    const end = contents.indexOf('`', tick + 1);
    if (end === -1) break;
    blocks.push({ css: contents.slice(tick + 1, end), index: tick });
    from = end + 1;
  }
  return blocks;
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

  for (const match of eachArbitraryUtility(contents, (prefix, value) => (
    COLOR_PREFIXES.has(prefix) && (isHexColor(value) || isColorFunction(value))
  ))) {
    const loc = offsetToLineCol(source, base + match.start);
    const prefix = match.utility.split('-')[0];
    occurrences.push({
      file: relativePath,
      line: loc.line,
      column: loc.column,
      selector,
      property: COLOR_PREFIXES.has(prefix) ? (prefix === 'text' ? 'color' : prefix === 'bg' ? 'background-color' : prefix) : 'color',
      rawValue: match.value,
      fullDeclarationValue: match.utility,
      category: 'color',
    });
  }

  for (const match of eachArbitraryUtility(contents, (prefix, value) => (
    LENGTH_PREFIXES.has(prefix) && isLengthValue(value)
  ))) {
    const loc = offsetToLineCol(source, base + match.start);
    const prefix = match.utility.split('-')[0];
    occurrences.push({
      file: relativePath,
      line: loc.line,
      column: loc.column,
      selector,
      property: prefix,
      rawValue: match.value,
      fullDeclarationValue: match.utility,
      category: categoryForTailwindPrefix(prefix),
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
  for (const block of eachCssInJsBlock(contents)) {
    const extracted = extractStylesheet(`${relativePath}.css`, relativePath, block.css);
    const start = offsetToLineCol(contents, block.index);
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
  for (const match of eachInlineStyle(contents)) {
    const classSelector = classSelectorFromAttrs(`${match.attrs} `);
    const selector = classSelector === '(inline-style)' ? match.tag : classSelector;
    const wrapped = `${selector} { ${match.css} }`;
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
  for (const block of eachStyleBlock(contents)) {
    let lang = 'css';
    const langIdx = block.attrs.toLowerCase().indexOf('lang');
    if (langIdx !== -1) {
      let j = langIdx + 4;
      while (j < block.attrs.length && isSpace(block.attrs[j])) j++;
      if (block.attrs[j] === '=') {
        j += 1;
        while (j < block.attrs.length && isSpace(block.attrs[j])) j++;
        const quote = block.attrs[j] === '"' || block.attrs[j] === "'" ? block.attrs[j] : '';
        const start = quote ? j + 1 : j;
        let end = start;
        while (end < block.attrs.length && (quote ? block.attrs[end] !== quote : /[A-Za-z]/.test(block.attrs[end] ?? ''))) {
          end += 1;
        }
        const raw = block.attrs.slice(start, end).toLowerCase();
        if (raw === 'scss' || raw === 'sass' || raw === 'less') lang = raw;
      }
    }
    const virtual = `${relativePath}.${lang}`;
    const extracted = extractStylesheet(virtual, relativePath, block.css);
    const start = offsetToLineCol(contents, block.cssOffset);
    for (const occ of extracted) {
      occurrences.push({ ...occ, line: occ.line + start.line - 1 });
    }
  }
  occurrences.push(...extractInlineStyles(contents, relativePath, extractStylesheet));
  occurrences.push(...extractCssInJs(contents, relativePath, extractStylesheet));
  for (const attr of eachClassAttribute(contents)) {
    occurrences.push(...extractTailwindArbitrary(attr.value, relativePath, '(class)', {
      text: contents,
      offset: attr.offset,
    }));
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
