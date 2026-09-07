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
  opacity: 'opacity',
  border: 'border',
  typography: 'typography',
  unknown: 'other',
};

function tokensStudioValue(token: NamedToken): string | Record<string, string> {
  if (token.composite?.kind === 'typography') {
    return { ...token.composite.parts };
  }
  if (token.composite?.kind === 'shadow') {
    const p = token.composite.parts;
    return {
      color: p.color,
      x: p.offsetX,
      y: p.offsetY,
      blur: p.blur ?? '0',
      spread: p.spread ?? '0',
      type: p.inset === 'true' ? 'innerShadow' : 'dropShadow',
    };
  }
  if (token.composite?.kind === 'border' || token.composite?.kind === 'transition') {
    return { ...token.composite.parts };
  }
  return token.value;
}

export function generateTokensStudioJson(tokens: NamedToken[], setName = 'global'): string {
  const set: Record<string, { value: string | Record<string, string>; type: string }> = {};
  for (const t of tokens) {
    set[t.name] = { value: tokensStudioValue(t), type: TOKENS_STUDIO_TYPE[t.category] ?? 'other' };
  }
  return JSON.stringify({ [setName]: set }, null, 2) + '\n';
}
