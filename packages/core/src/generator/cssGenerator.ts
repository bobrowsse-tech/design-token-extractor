import { NamedToken, TokenCategory } from '../types';

const CATEGORY_ORDER: TokenCategory[] = [
  'color', 'spacing', 'radius', 'font-family', 'font-size', 'font-weight',
  'line-height', 'letter-spacing', 'shadow', 'z-index', 'breakpoint', 'transition',
];

export function generateCssFile(tokens: NamedToken[], category: TokenCategory): string {
  const inCategory = tokens.filter((t) => t.category === category).sort((a, b) => a.name.localeCompare(b.name));
  if (inCategory.length === 0) return '';
  const lines = [`/* ${category} tokens — generated, do not hand-edit; re-run the scan instead. */`, ':root {'];
  for (const t of inCategory) {
    lines.push(`  --${t.name}: ${t.value}; /* used ${t.occurrenceCount}x across ${t.fileCount} file(s) */`);
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
