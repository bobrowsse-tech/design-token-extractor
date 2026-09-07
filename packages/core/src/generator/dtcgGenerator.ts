import { NamedToken, TokenCategory } from '../types';

// https://design-tokens.github.io/community-group/format/ — $type per group.
// Not every category maps to an official DTCG type yet (e.g. z-index,
// easing); those fall back to the generic "other" type rather than
// inventing a nonstandard one, so DTCG-consuming tools don't choke on an
// unrecognized type they can't skip.
const DTCG_TYPE: Record<TokenCategory, string> = {
  color: 'color',
  spacing: 'dimension',
  radius: 'dimension',
  'font-family': 'fontFamily',
  'font-size': 'dimension',
  'font-weight': 'fontWeight',
  'line-height': 'number',
  'letter-spacing': 'dimension',
  shadow: 'dimension',
  'z-index': 'number',
  breakpoint: 'dimension',
  transition: 'duration',
  unknown: 'other',
};

function groupKeyFromName(category: TokenCategory, name: string): string {
  // Token name already carries the category prefix (e.g. "color-blue-500");
  // strip it for a cleaner nested key ("blue-500") since the category is
  // already the group.
  return name.startsWith(`${category}-`) ? name.slice(category.length + 1) : name;
}

export function generateDtcgJson(tokens: NamedToken[]): string {
  const root: Record<string, Record<string, { $value: string; $type: string; $description: string }>> = {};

  for (const t of tokens) {
    const group = t.category;
    root[group] ??= {};
    const key = groupKeyFromName(t.category, t.name);
    root[group][key] = {
      $value: t.value,
      $type: DTCG_TYPE[t.category] ?? 'other',
      $description: `Used ${t.occurrenceCount} time(s) across ${t.fileCount} file(s).`,
    };
  }

  return JSON.stringify(root, null, 2) + '\n';
}
