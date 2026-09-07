import { NamedToken, TokenCategory } from '../types';

// Tokens Studio (the Figma plugin, formerly "Figma Tokens") uses "value"/
// "type" keys with no leading $, flat inside a named token set (commonly
// "global"). See https://docs.tokens.studio/ for the format.
const TOKENS_STUDIO_TYPE: Record<TokenCategory, string> = {
  color: 'color',
  spacing: 'spacing',
  radius: 'borderRadius',
  'font-family': 'fontFamilies',
  'font-size': 'fontSizes',
  'font-weight': 'fontWeights',
  'line-height': 'lineHeights',
  'letter-spacing': 'letterSpacing',
  shadow: 'boxShadow',
  'z-index': 'other',
  breakpoint: 'sizing',
  transition: 'other',
  unknown: 'other',
};

export function generateTokensStudioJson(tokens: NamedToken[], setName = 'global'): string {
  const set: Record<string, { value: string; type: string }> = {};
  for (const t of tokens) {
    set[t.name] = { value: t.value, type: TOKENS_STUDIO_TYPE[t.category] ?? 'other' };
  }
  return JSON.stringify({ [setName]: set }, null, 2) + '\n';
}
