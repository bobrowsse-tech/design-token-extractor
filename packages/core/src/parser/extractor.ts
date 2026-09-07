import * as postcss from 'postcss';
import * as scss from 'postcss-scss';
import * as path from 'path';
import { TokenOccurrence, TokenCategory } from '../types';
import {
  classifyProperty,
  COLOR_REGEX,
  LENGTH_REGEX,
  TIME_REGEX,
  EASING_REGEX,
  MEDIA_BREAKPOINT_REGEX,
  INTEGER_REGEX,
} from './valueClassifier';

function nearestSelector(decl: postcss.Declaration): string {
  const parent = decl.parent;
  if (!parent) return '(root)';
  if (parent.type === 'rule') return (parent as postcss.Rule).selector;
  if (parent.type === 'atrule') return `@${(parent as postcss.AtRule).name} ${(parent as postcss.AtRule).params}`;
  return '(unknown)';
}

function pushMatches(
  occurrences: TokenOccurrence[],
  regex: RegExp,
  text: string,
  category: TokenCategory,
  ctx: { file: string; line: number; column: number; selector: string; property: string; fullDeclarationValue: string }
) {
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    occurrences.push({
      file: ctx.file,
      line: ctx.line,
      column: ctx.column,
      selector: ctx.selector,
      property: ctx.property,
      rawValue: m[0],
      fullDeclarationValue: ctx.fullDeclarationValue,
      category,
    });
  }
}

/**
 * Extract token occurrences from a single file's contents.
 * @param filePath absolute path (used for reporting only)
 * @param relativePath path relative to workspace root, stored in the report
 * @param contents raw file text
 */
export function extractFromSource(
  filePath: string,
  relativePath: string,
  contents: string
): TokenOccurrence[] {
  const occurrences: TokenOccurrence[] = [];
  const ext = path.extname(filePath).toLowerCase();

  // .scss/.sass need the scss parser to tolerate $variables, nesting, //-comments.
  // postcss.parse() no longer accepts a `syntax` option — pass the parser
  // directly. .css/.less use the default parser. This does NOT fully
  // understand LESS-specific syntax (e.g. `.mixin()` calls, `@var` interpolation) —
  // good enough for literal-value extraction, but flag for a dedicated
  // postcss-less pass in Phase 5 if LESS usage is heavy.
  let root: postcss.Root;
  try {
    root = ext === '.scss' || ext === '.sass'
      ? scss.parse(contents, { from: filePath })
      : postcss.parse(contents, { from: filePath });
  } catch (err) {
    // Malformed file — do not crash the whole scan, report and move on.
    console.warn(`[design-tokens] Failed to parse ${relativePath}: ${(err as Error).message}`);
    return occurrences;
  }

  // --- Declarations: color, spacing, typography, radius, shadow, z-index, transition ---
  root.walkDecls((decl) => {
    const prop = decl.prop.trim().toLowerCase();
    const value = decl.value;
    const line = decl.source?.start?.line ?? 0;
    const column = decl.source?.start?.column ?? 0;
    const selector = nearestSelector(decl);
    const ctx = { file: relativePath, line, column, selector, property: prop, fullDeclarationValue: value };

    // Colors can appear inside ANY property's shorthand (border, box-shadow, background...),
    // so always scan for them regardless of the property's primary category.
    pushMatches(occurrences, COLOR_REGEX, value, 'color', ctx);

    const category = classifyProperty(prop);

    switch (category) {
      case 'spacing':
      case 'radius':
        pushMatches(occurrences, LENGTH_REGEX, value, category, ctx);
        break;
      case 'font-size':
      case 'letter-spacing':
        pushMatches(occurrences, LENGTH_REGEX, value, category, ctx);
        break;
      case 'line-height':
        // line-height is often unitless (e.g. 1.5) — capture both unitless numbers and lengths
        if (/^-?\d*\.?\d+$/.test(value.trim())) {
          occurrences.push({ ...ctx, rawValue: value.trim(), category: 'line-height' });
        } else {
          pushMatches(occurrences, LENGTH_REGEX, value, 'line-height', ctx);
        }
        break;
      case 'font-family':
        occurrences.push({ ...ctx, rawValue: value.trim(), category: 'font-family' });
        break;
      case 'font-weight':
        if (INTEGER_REGEX.test(value.trim()) || /^(normal|bold|lighter|bolder)$/i.test(value.trim())) {
          occurrences.push({ ...ctx, rawValue: value.trim(), category: 'font-weight' });
        }
        break;
      case 'shadow':
        pushMatches(occurrences, LENGTH_REGEX, value, 'shadow', ctx);
        break;
      case 'z-index':
        if (INTEGER_REGEX.test(value.trim())) {
          occurrences.push({ ...ctx, rawValue: value.trim(), category: 'z-index' });
        }
        break;
      case 'transition':
        pushMatches(occurrences, TIME_REGEX, value, 'transition', ctx);
        pushMatches(occurrences, EASING_REGEX, value, 'transition', ctx);
        break;
      default:
        // Unknown property: skip. Revisit in Phase 5 if noise from
        // legitimate properties (e.g. `flex`, `grid-template-columns`) matters.
        break;
    }
  });

  // --- @media breakpoints ---
  root.walkAtRules('media', (atRule) => {
    const line = atRule.source?.start?.line ?? 0;
    const column = atRule.source?.start?.column ?? 0;
    MEDIA_BREAKPOINT_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MEDIA_BREAKPOINT_REGEX.exec(atRule.params)) !== null) {
      occurrences.push({
        file: relativePath,
        line,
        column,
        selector: `@media ${atRule.params}`,
        property: '@media',
        rawValue: m[2],
        fullDeclarationValue: atRule.params,
        category: 'breakpoint',
      });
    }
  });

  return occurrences;
}
