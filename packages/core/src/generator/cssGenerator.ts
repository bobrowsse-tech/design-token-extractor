import { NamedToken, TokenCategory } from '../types';
import { typographyToFontShorthand } from '../parser/composites';

/** Stylesheet value for a token. Typography composites become a `font`
 * shorthand; they are omitted when that shorthand cannot be formed so we
 * never write a semicolon-separated synthetic string into CSS/SCSS. */
export function tokenStylesheetValue(token: NamedToken): string | null {
  if (token.category === 'typography' || token.composite?.kind === 'typography') {
    return typographyToFontShorthand(token.composite?.parts ?? {});
  }
  return token.value;
}

const CATEGORY_ORDER: TokenCategory[] = [
  'color', 'spacing', 'radius', 'font-family', 'font-size', 'font-weight',
  'line-height', 'letter-spacing', 'shadow', 'z-index', 'breakpoint', 'transition',
  'opacity', 'border', 'typography',
];

export function generateCssFile(tokens: NamedToken[], category: TokenCategory): string {
  const inCategory = tokens
    .filter((t) => t.category === category)
    .map((t) => ({ token: t, value: tokenStylesheetValue(t) }))
    .filter((row): row is { token: NamedToken; value: string } => row.value !== null)
    .sort((a, b) => a.token.name.localeCompare(b.token.name));
  if (inCategory.length === 0) return '';
  const lines = [`/* ${category} tokens — generated, do not hand-edit; re-run the scan instead. */`, ':root {'];
  for (const { token: t, value } of inCategory) {
    lines.push(`  --${t.name}: ${value}; /* used ${t.occurrenceCount}x across ${t.fileCount} file(s) */`);
  }
  lines.push('}', '');
  return lines.join('\n');
}

export function generateCssIndex(categoriesWithFiles: TokenCategory[]): string {
  const lines = ['/* Generated index — imports every generated token file. */'];
  for (const category of CATEGORY_ORDER) {
    if (categoriesWithFiles.includes(category)) {
      lines.push(`@import "./${category}.css";`);
    }
  }
  return lines.join('\n') + '\n';
}

export { CATEGORY_ORDER };
