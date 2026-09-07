import * as postcss from 'postcss';
import * as scss from 'postcss-scss';
import * as path from 'path';
import { normalizeColorKey } from '../clustering/cluster';

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
  const sorted = [...replacements].sort((a, b) => b.startOffset - a.startOffset);
  let next = contents;
  for (const item of sorted) {
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

function lineColToOffset(text: string, line: number, column: number): number {
  let offset = 0;
  let currentLine = 1;
  while (currentLine < line) {
    const newline = text.indexOf('\n', offset);
    if (newline === -1) return text.length;
    offset = newline + 1;
    currentLine += 1;
  }
  return offset + (column - 1);
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
 * Replaces occurrences of `targetRawValue` with a token reference, but ONLY
 * where the declaration's value is EXACTLY that literal (`color: #3B82F6;`),
 * never inside a shorthand where the value is one part of several
 * (`box-shadow: 0 4px 6px #3B82F6;`). Shorthand cases are counted and
 * reported, not silently skipped without a trace and never guessed at —
 * per the build directive's rewrite-safety rules, ambiguous contexts get
 * flagged for manual handling rather than rewritten automatically.
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
  const ext = path.extname(filePath).toLowerCase();
  const root = ext === '.scss' || ext === '.sass'
    ? scss.parse(contents, { from: filePath })
    : postcss.parse(contents, { from: filePath });

  const reference = tokenReference(request.tokenName, request.varStyle);
  const target = request.targetRawValue.trim();
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
      skippedShorthandCount++;
    }
  });

  return {
    newContents: applyRewriteReplacements(contents, replacements),
    replacedCount: replacements.length,
    skippedShorthandCount,
    replacements,
  };
}
