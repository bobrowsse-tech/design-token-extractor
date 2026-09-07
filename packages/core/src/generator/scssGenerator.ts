import { NamedToken, TokenCategory } from '../types';

export function generateScssFile(tokens: NamedToken[], category: TokenCategory): string {
  const inCategory = tokens.filter((t) => t.category === category).sort((a, b) => a.name.localeCompare(b.name));
  if (inCategory.length === 0) return '';
  const lines = [`// ${category} tokens — generated, do not hand-edit; re-run the scan instead.`];
  for (const t of inCategory) {
    lines.push(`$${t.name}: ${t.value}; // used ${t.occurrenceCount}x across ${t.fileCount} file(s)`);
  }
  return lines.join('\n') + '\n';
}
