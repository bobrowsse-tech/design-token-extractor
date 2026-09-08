import * as postcss from 'postcss';
import { normalizeColorKey } from '../clustering/cluster';
import { isStylesheetFile, lineColToOffset, parseStylesheet } from '../parser/parseStylesheet';
import { uniqueSubstringReplace } from './tokenReferences';

function exactValueMatches(value: string, target: string): boolean {
  if (value === target) return true;
  const valueColor = normalizeColorKey(value);
  const targetColor = normalizeColorKey(target);
  return valueColor !== null && valueColor === targetColor;
}

export interface RewriteRequest {
  targetRawValue: string;
  tokenName: string;
  varStyle: 'css' | 'scss';
}

/** One declaration-value edit, offsets against the original file text. */
export interface RewriteReplacement {
  startOffset: number;
  endOffset: number;
  originalValue: string;
  replacement: string;
}

export interface RewriteResult {
  newContents: string;
  replacedCount: number;
  skippedShorthandCount: number;
  replacements: RewriteReplacement[];
}

export function tokenReference(tokenName: string, varStyle: 'css' | 'scss'): string {
  return varStyle === 'scss' ? `$${tokenName}` : `var(--${tokenName})`;
}

/** Apply non-overlapping replacements to `contents`. Later (higher offset) edits first. */
export function applyRewriteReplacements(contents: string, replacements: RewriteReplacement[]): string {
  const sorted = [...replacements].sort((a, b) => b.startOffset - a.startOffset || b.endOffset - a.endOffset);
  const kept: RewriteReplacement[] = [];
  for (const item of sorted) {
    if (kept.some((prev) => item.startOffset < prev.endOffset && prev.startOffset < item.endOffset)) continue;
    kept.push(item);
  }
  let next = contents;
  for (const item of kept) {
    next = next.slice(0, item.startOffset) + item.replacement + next.slice(item.endOffset);
  }
  return next;
}

/** Invert applied replacements so the result is the original text. */
export function invertRewriteReplacements(replacements: RewriteReplacement[]): RewriteReplacement[] {
  const applied = [...replacements].sort((a, b) => a.startOffset - b.startOffset);
  let shift = 0;
  const inverted: RewriteReplacement[] = [];
  for (const item of applied) {
    const startOffset = item.startOffset + shift;
    const endOffset = startOffset + item.replacement.length;
    inverted.push({
      startOffset,
      endOffset,
      originalValue: item.replacement,
      replacement: item.originalValue,
    });
    shift += item.replacement.length - (item.endOffset - item.startOffset);
  }
  return inverted;
}

export function isBoundedLiteral(text: string, index: number, needle: string): boolean {
  if (index < 0 || needle.length === 0) return false;
  const before = index === 0 ? '' : text[index - 1];
  const after = text[index + needle.length] ?? '';
  if (/[A-Za-z0-9_]/.test(before)) return false;
  if (/[A-Za-z0-9_]/.test(after)) return false;
  return true;
}

export function findLiteralRange(
  contents: string,
  line: number,
  column: number,
  needle: string
): { startOffset: number; endOffset: number } | null {
  if (!needle) return null;
  const lineStart = lineColToOffset(contents, line, 1);
  const newline = contents.indexOf('\n', lineStart);
  const lineEnd = newline === -1 ? contents.length : newline;
  const lineText = contents.slice(lineStart, lineEnd);
  const fromColumn = Math.max(0, column - 1);
  const atColumn = lineText.indexOf(needle, fromColumn);
  if (atColumn !== -1) {
    return { startOffset: lineStart + atColumn, endOffset: lineStart + atColumn + needle.length };
  }
  const first = lineText.indexOf(needle);
  if (first !== -1 && lineText.indexOf(needle, first + needle.length) === -1) {
    return { startOffset: lineStart + first, endOffset: lineStart + first + needle.length };
  }
  const fileFirst = contents.indexOf(needle);
  if (fileFirst !== -1 && contents.indexOf(needle, fileFirst + needle.length) === -1 && isBoundedLiteral(contents, fileFirst, needle)) {
    return { startOffset: fileFirst, endOffset: fileFirst + needle.length };
  }
  return null;
}

function collectTextReplacements(contents: string, target: string, replacement: string): RewriteReplacement[] {
  const replacements: RewriteReplacement[] = [];
  let from = 0;
  while (from < contents.length) {
    const index = contents.indexOf(target, from);
    if (index === -1) break;
    if (isBoundedLiteral(contents, index, target)) {
      replacements.push({
        startOffset: index,
        endOffset: index + target.length,
        originalValue: target,
        replacement,
      });
    }
    from = index + target.length;
  }
  return replacements;
}

/** Locate `decl.value` in the original source. Returns null if it cannot be pinned. */
export function declarationValueRange(
  decl: postcss.Declaration,
  contents: string
): { startOffset: number; endOffset: number } | null {
  const start = decl.source?.start;
  if (!start) return null;
  const end = decl.source?.end;
  const startOffset = typeof start.offset === 'number'
    ? start.offset
    : lineColToOffset(contents, start.line, start.column);
  const endOffset = end
    ? (typeof end.offset === 'number'
      ? end.offset + 1
      : lineColToOffset(contents, end.line, end.column) + 1)
    : contents.length;
  const slice = contents.slice(startOffset, endOffset);
  const between = decl.raws.between ?? ':';
  const prefix = `${decl.prop}${between}`;
  if (slice.startsWith(prefix) && slice.slice(prefix.length, prefix.length + decl.value.length) === decl.value) {
    const valueStart = startOffset + prefix.length;
    return { startOffset: valueStart, endOffset: valueStart + decl.value.length };
  }
  const colon = slice.indexOf(':');
  if (colon === -1) return null;
  const valueIndex = slice.indexOf(decl.value, colon + 1);
  if (valueIndex === -1) return null;
  return {
    startOffset: startOffset + valueIndex,
    endOffset: startOffset + valueIndex + decl.value.length,
  };
}

/**
 * Replaces `targetRawValue` with a token reference on exact declarations
 * (`color: #3B82F6`) and on unique substring matches inside shorthand,
 * `calc()`, or similar (`box-shadow: 0 4px 6px #3B82F6`). Ambiguous repeats
 * of the same literal in one value are counted as skipped, not guessed.
 *
 * Edits are recorded as per-declaration value ranges against the original
 * text. `newContents` is those ranges applied to the original string, so
 * comments, formatting, and unrelated declarations are preserved byte-for-byte.
 */
export function rewriteSimpleOccurrences(
  filePath: string,
  contents: string,
  request: RewriteRequest
): RewriteResult {
  const reference = tokenReference(request.tokenName, request.varStyle);
  const target = request.targetRawValue.trim();

  if (!isStylesheetFile(filePath)) {
    const replacements = collectTextReplacements(contents, target, reference);
    return {
      newContents: applyRewriteReplacements(contents, replacements),
      replacedCount: replacements.length,
      skippedShorthandCount: 0,
      replacements,
    };
  }

  let root: postcss.Root;
  try {
    root = parseStylesheet(filePath, contents);
  } catch {
    const replacements = collectTextReplacements(contents, target, reference);
    return {
      newContents: applyRewriteReplacements(contents, replacements),
      replacedCount: replacements.length,
      skippedShorthandCount: 0,
      replacements,
    };
  }

  const replacements: RewriteReplacement[] = [];
  let skippedShorthandCount = 0;

  root.walkDecls((decl) => {
    const trimmedValue = decl.value.trim();
    if (exactValueMatches(trimmedValue, target)) {
      const range = declarationValueRange(decl, contents);
      if (!range) return;
      replacements.push({
        startOffset: range.startOffset,
        endOffset: range.endOffset,
        originalValue: contents.slice(range.startOffset, range.endOffset),
        replacement: reference,
      });
    } else if (trimmedValue.includes(target)) {
      const next = uniqueSubstringReplace(decl.value, request.targetRawValue.trim(), reference);
      const range = next ? declarationValueRange(decl, contents) : null;
      if (next && range) {
        replacements.push({
          startOffset: range.startOffset,
          endOffset: range.endOffset,
          originalValue: contents.slice(range.startOffset, range.endOffset),
          replacement: next,
        });
      } else {
        skippedShorthandCount++;
      }
    }
  });

  return {
    newContents: applyRewriteReplacements(contents, replacements),
    replacedCount: replacements.length,
    skippedShorthandCount,
    replacements,
  };
}
