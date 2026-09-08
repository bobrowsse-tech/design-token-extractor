import { NamedToken, TokenCategory } from '../types';
import { aliasToEmit, tokenStylesheetValue } from './cssGenerator';

export function generateScssFile(
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
  const lines = [`// ${category} tokens — generated, do not hand-edit; re-run the scan instead.`];
  for (const { token: t, value } of inCategory) {
    lines.push(`$${t.name}: ${value}; // used ${t.occurrenceCount}x across ${t.fileCount} file(s)`);
    const alias = aliasToEmit(t, aliases, claimed);
    if (alias) {
      lines.push(`$${alias}: $${t.name};`);
      claimed.add(alias);
    }
  }
  return lines.join('\n') + '\n';
}
