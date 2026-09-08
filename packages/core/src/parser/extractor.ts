import * as postcss from 'postcss';
import { TokenOccurrence, TokenCategory } from '../types';
import { parseStylesheet, isMarkupFile, isScriptFile, stylesheetExt } from './parseStylesheet';
import { extractFromMarkup, extractFromScript, extractVueSfc } from './extractExtraSources';
import {
  classifyProperty,
  COLOR_REGEX,
  LENGTH_REGEX,
  TIME_REGEX,
  EASING_REGEX,
  MEDIA_BREAKPOINT_REGEX,
  INTEGER_REGEX,
  OPACITY_VALUE_REGEX,
  SHADOW_SHORTHAND_PROPS,
  BORDER_SHORTHAND_PROPS_SET,
  TRANSITION_SHORTHAND_PROPS,
} from './valueClassifier';
import { parseShadowComposite, parseBorderComposite, parseTransitionComposite, serializeTypographyParts } from './composites';

const FONT_COMPOSITE_PROPS: Record<string, string> = {
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
  'line-height': 'lineHeight',
  'letter-spacing': 'letterSpacing',
};

function declarationBlockKey(decl: postcss.Declaration, file: string, selector: string): string {
  const start = decl.parent?.source?.start;
  return `${file}::${selector}::${start?.line ?? 0}:${start?.column ?? 0}`;
}

function enclosingMediaQuery(node: postcss.Node): string | undefined {
  let current: postcss.Container | postcss.Document | undefined = node.parent;
  while (current && current.type !== 'root' && current.type !== 'document') {
    if (current.type === 'atrule') {
      const atRule = current as postcss.AtRule;
      if (atRule.name === 'media') return atRule.params;
    }
    current = current.parent;
  }
  return undefined;
}

function nearestSelector(decl: postcss.Declaration): string {
  let current: postcss.Container | postcss.Document | undefined = decl.parent;
  let fallbackAt: string | null = null;
  while (current && current.type !== 'root' && current.type !== 'document') {
    if (current.type === 'rule') return (current as postcss.Rule).selector;
    if (current.type === 'atrule' && !fallbackAt) {
      const atRule = current as postcss.AtRule;
      fallbackAt = `@${atRule.name} ${atRule.params}`;
    }
    current = current.parent;
  }
  return fallbackAt ?? '(root)';
}

type OccurrenceCtx = {
  file: string;
  line: number;
  column: number;
  selector: string;
  property: string;
  fullDeclarationValue: string;
  mediaQuery?: string;
};

function pushMatches(
  occurrences: TokenOccurrence[],
  regex: RegExp,
  text: string,
  category: TokenCategory,
  ctx: OccurrenceCtx
) {
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    occurrences.push({
      ...ctx,
      rawValue: m[0],
      category,
    });
  }
}

function pushOccurrence(
  occurrences: TokenOccurrence[],
  ctx: OccurrenceCtx,
  rawValue: string,
  category: TokenCategory,
  extra?: Partial<TokenOccurrence>
) {
  occurrences.push({ ...ctx, rawValue, category, ...extra });
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
  const ext = stylesheetExt(filePath);
  if (ext === '.vue') return extractVueSfc(contents, relativePath, extractFromStylesheet);
  if (isMarkupFile(filePath)) return extractFromMarkup(contents, relativePath, extractFromStylesheet);
  if (isScriptFile(filePath)) return extractFromScript(contents, relativePath, extractFromStylesheet);
  return extractFromStylesheet(filePath, relativePath, contents);
}

/**
 * Extract token occurrences from a CSS/SCSS/SASS/LESS stylesheet.
 * Vue / HTML / JS sources go through `extractFromSource`.
 */
export function extractFromStylesheet(
  filePath: string,
  relativePath: string,
  contents: string
): TokenOccurrence[] {
  const occurrences: TokenOccurrence[] = [];

  let root: postcss.Root;
  try {
    root = parseStylesheet(filePath, contents);
  } catch (err) {
    console.warn(`[design-tokens] Failed to parse ${relativePath}: ${(err as Error).message}`);
    return occurrences;
  }

  const typographyByBlock = new Map<string, TokenOccurrence[]>();

  const trackFontOccurrence = (occ: TokenOccurrence, decl: postcss.Declaration) => {
    if (!FONT_COMPOSITE_PROPS[occ.property]) return;
    const key = declarationBlockKey(decl, occ.file, occ.selector);
    const list = typographyByBlock.get(key) ?? [];
    list.push(occ);
    typographyByBlock.set(key, list);
  };

  // --- Declarations: color, spacing, typography, radius, shadow, z-index, transition ---
  root.walkDecls((decl) => {
    const prop = decl.prop.trim().toLowerCase();
    // Custom-property *definitions* (`--brand-blue: #3B82F6`) are already-tokenized
    // values, not unmigrated literals. Extracting them as raw occurrences pollutes
    // clustering and can mint a duplicate token. Usages (`var(--brand-blue)`) are
    // already ignored because COLOR_REGEX / LENGTH_REGEX do not match `var(...)`.
    if (prop.startsWith('--') || prop.startsWith('@')) return;

    const value = decl.value;
    const line = decl.source?.start?.line ?? 0;
    const column = decl.source?.start?.column ?? 0;
    const selector = nearestSelector(decl);
    const mediaQuery = enclosingMediaQuery(decl);
    const ctx = {
      file: relativePath,
      line,
      column,
      selector,
      property: prop,
      fullDeclarationValue: value,
      ...(mediaQuery ? { mediaQuery } : {}),
    };

    if (SHADOW_SHORTHAND_PROPS.has(prop)) {
      const composite = parseShadowComposite(value);
      if (composite) {
        pushOccurrence(occurrences, ctx, value.trim(), 'shadow', { composite });
        return;
      }
    }

    if (BORDER_SHORTHAND_PROPS_SET.has(prop)) {
      const composite = parseBorderComposite(value);
      if (composite) {
        pushOccurrence(occurrences, ctx, value.trim(), 'border', { composite });
        return;
      }
    }

    if (TRANSITION_SHORTHAND_PROPS.has(prop)) {
      const composite = parseTransitionComposite(value);
      if (composite) {
        pushOccurrence(occurrences, ctx, value.trim(), 'transition', { composite });
        return;
      }
    }

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
      case 'letter-spacing': {
        const before = occurrences.length;
        pushMatches(occurrences, LENGTH_REGEX, value, category, ctx);
        for (const occ of occurrences.slice(before)) trackFontOccurrence(occ, decl);
        break;
      }
      case 'line-height': {
        // line-height is often unitless (e.g. 1.5) — capture both unitless numbers and lengths
        const before = occurrences.length;
        if (/^-?\d*\.?\d+$/.test(value.trim())) {
          pushOccurrence(occurrences, ctx, value.trim(), 'line-height');
        } else {
          pushMatches(occurrences, LENGTH_REGEX, value, 'line-height', ctx);
        }
        for (const occ of occurrences.slice(before)) trackFontOccurrence(occ, decl);
        break;
      }
      case 'font-family': {
        const before = occurrences.length;
        pushOccurrence(occurrences, ctx, value.trim(), 'font-family');
        for (const occ of occurrences.slice(before)) trackFontOccurrence(occ, decl);
        break;
      }
      case 'font-weight':
        if (INTEGER_REGEX.test(value.trim()) || /^(normal|bold|lighter|bolder)$/i.test(value.trim())) {
          const before = occurrences.length;
          pushOccurrence(occurrences, ctx, value.trim(), 'font-weight');
          for (const occ of occurrences.slice(before)) trackFontOccurrence(occ, decl);
        }
        break;
      case 'shadow':
        pushMatches(occurrences, LENGTH_REGEX, value, 'shadow', ctx);
        break;
      case 'border':
        pushMatches(occurrences, LENGTH_REGEX, value, 'spacing', ctx);
        break;
      case 'z-index':
        if (INTEGER_REGEX.test(value.trim())) {
          pushOccurrence(occurrences, ctx, value.trim(), 'z-index');
        }
        break;
      case 'transition':
        pushMatches(occurrences, TIME_REGEX, value, 'transition', ctx);
        pushMatches(occurrences, EASING_REGEX, value, 'transition', ctx);
        break;
      case 'opacity':
        if (OPACITY_VALUE_REGEX.test(value.trim())) {
          pushOccurrence(occurrences, ctx, value.trim(), 'opacity');
        }
        break;
      default:
        // Unknown properties (`flex`, `grid-template-columns`, …): take
        // design-relevant literals only — colors (already scanned), lengths,
        // and times. Keyword-only values are ignored.
        pushMatches(occurrences, LENGTH_REGEX, value, 'spacing', ctx);
        pushMatches(occurrences, TIME_REGEX, value, 'transition', ctx);
        break;
    }
  });

  emitTypographyComposites(typographyByBlock, occurrences);

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
        mediaQuery: atRule.params,
      });
    }
  });

  return occurrences;
}

/** After walking decls, emit one typography composite per declaration block
 * that has 2+ of font-family / font-size / font-weight / line-height /
 * letter-spacing. Later rules for the same selector (media queries, overrides)
 * stay their own composite. Last longhand in a block wins. Primitive font-*
 * tokens are kept. */
function emitTypographyComposites(
  typographyByBlock: Map<string, TokenOccurrence[]>,
  occurrences: TokenOccurrence[]
) {
  for (const group of typographyByBlock.values()) {
    const parts: Record<string, string> = {};
    for (const occ of group) {
      const key = FONT_COMPOSITE_PROPS[occ.property];
      if (key) parts[key] = occ.rawValue;
    }
    if (Object.keys(parts).length < 2) continue;
    const first = group[0];
    const serialized = serializeTypographyParts(parts);
    occurrences.push({
      file: first.file,
      line: first.line,
      column: first.column,
      selector: first.selector,
      property: 'typography',
      rawValue: serialized,
      fullDeclarationValue: serialized,
      category: 'typography',
      composite: { kind: 'typography', parts },
      ...(first.mediaQuery ? { mediaQuery: first.mediaQuery } : {}),
    });
  }
}
