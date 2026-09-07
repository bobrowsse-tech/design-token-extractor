import { NamedToken, TokenCategory } from '../types';
import { tokenStylesheetValue } from './cssGenerator';

export function generateScssFile(tokens: NamedToken[], category: TokenCategory): string {
  const inCategory = tokens
    .filter((t) => t.category === category)
    .map((t) => ({ token: t, value: tokenStylesheetValue(t) }))
    .filter((row): row is { token: NamedToken; value: string } => row.value !== null)
    .sort((a, b) => a.token.name.localeCompare(b.token.name));
  if (inCategory.length === 0) return '';
  const lines = [`// ${category} tokens — generated, do not hand-edit; re-run the scan instead.`];
  for (const { token: t, value } of inCategory) {
    lines.push(`$${t.name}: ${value}; // used ${t.occurrenceCount}x across ${t.fileCount} file(s)`);
  }
  return lines.join('\n') + '\n';
}
