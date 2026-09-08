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

export function generateCssFile(
  tokens: NamedToken[],
  category: TokenCategory,
  aliases: Record<string, string> = {}
): string {
  const inCategory = tokens
    .filter((t) => t.category === category)
    .map((t) => ({ token: t, value: tokenStylesheetValue(t) }))
    .filter((row): row is { token: NamedToken; value: string } => row.value !== null)
    .sort((a, b) => a.token.name.localeCompare(b.token.name));
  if (inCategory.length === 0) return '';
  const claimed = new Set(inCategory.map((row) => row.token.name));
  const lines = [`/* ${category} tokens — generated, do not hand-edit; re-run the scan instead. */`, ':root {'];
  for (const { token: t, value } of inCategory) {
    lines.push(`  --${t.name}: ${value}; /* used ${t.occurrenceCount}x across ${t.fileCount} file(s) */`);
    const alias = aliasToEmit(t, aliases, claimed);
    if (alias) {
      lines.push(`  --${alias}: var(--${t.name});`);
      claimed.add(alias);
    }
  }
  lines.push('}', '');
  return lines.join('\n');
}

/** User alias, or auto semantic name, never a name already used as a token. */
export function aliasToEmit(
  token: NamedToken,
  aliases: Record<string, string>,
  claimed: Set<string>
): string | null {
  const candidate = aliases[token.name] ?? token.semanticName;
  if (!candidate || candidate === token.name || claimed.has(candidate)) return null;
  return candidate;
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
