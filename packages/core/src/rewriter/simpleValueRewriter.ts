import * as postcss from 'postcss';
import * as scss from 'postcss-scss';
import * as path from 'path';

export interface RewriteRequest {
  targetRawValue: string;
  tokenName: string;
  varStyle: 'css' | 'scss';
}

export interface RewriteResult {
  newContents: string;
  replacedCount: number;
  skippedShorthandCount: number;
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
 * This operates on postcss's real AST (not text/regex splicing), so
 * comments, strings, and unrelated matches elsewhere in the file are never
 * touched.
 */
export function rewriteSimpleOccurrences(
  filePath: string,
  contents: string,
  request: RewriteRequest
): RewriteResult {
  const ext = path.extname(filePath).toLowerCase();
  // postcss.parse() no longer accepts a `syntax` option — use the SCSS parser
  // directly for .scss/.sass so nesting and //-comments survive the rewrite.
  const root = ext === '.scss' || ext === '.sass'
    ? scss.parse(contents, { from: filePath })
    : postcss.parse(contents, { from: filePath });

  const reference = request.varStyle === 'scss' ? `$${request.tokenName}` : `var(--${request.tokenName})`;
  let replacedCount = 0;
  let skippedShorthandCount = 0;

  root.walkDecls((decl) => {
    const trimmedValue = decl.value.trim();
    if (trimmedValue === request.targetRawValue.trim()) {
      decl.value = reference;
      replacedCount++;
    } else if (trimmedValue.includes(request.targetRawValue.trim())) {
      // The target value appears, but as part of a larger shorthand value —
      // rewriting just the substring risks corrupting the rest (e.g. which
      // number in `0 4px 6px rgba(...)` is "the" match). Leave it alone and
      // report it so the caller can surface it for manual review.
      skippedShorthandCount++;
    }
  });

  return {
    newContents: root.toString(),
    replacedCount,
    skippedShorthandCount,
  };
}
