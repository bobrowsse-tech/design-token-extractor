import { TokenCategory } from '../types';

// Maps our categories onto the CSS properties that should be forced through
// var(--token) once a token system exists. Uses the real, existing
// `stylelint-declaration-strict-value` plugin rather than inventing a custom
// rule — one less thing for this project to maintain, and it's a
// well-established plugin (see https://github.com/AndyOGo/stylelint-declaration-strict-value).
const CATEGORY_PROPERTIES: Partial<Record<TokenCategory, string[]>> = {
  color: ['color', 'background-color', 'border-color', 'outline-color', 'fill', 'stroke'],
  spacing: ['margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap'],
  radius: ['border-radius'],
  'font-size': ['font-size'],
  'font-family': ['font-family'],
  'z-index': ['z-index'],
};

/**
 * Returns a ready-to-write `.stylelintrc.json`. Only includes rules for
 * categories that actually had tokens generated — no point forcing
 * `font-size` through tokens if the project never had a font-size token in
 * the first place.
 */
export function generateStylelintConfig(categoriesWithTokens: Set<TokenCategory>): string {
  const properties = new Set<string>();
  for (const [category, props] of Object.entries(CATEGORY_PROPERTIES)) {
    if (categoriesWithTokens.has(category as TokenCategory)) {
      for (const p of props ?? []) properties.add(p);
    }
  }

  const config = {
    plugins: ['stylelint-declaration-strict-value'],
    rules: {
      'scale-unlimited/declaration-strict-value': [
        [...properties].sort(),
        {
          ignoreValues: ['inherit', 'initial', 'unset', 'currentColor', 'transparent', '0', 'none'],
          message: 'Use a design token (var(--token-name) or $token-name) instead of a hardcoded value. Run "Design Tokens: Scan Workspace" if this should be a new token.',
        },
      ],
    },
  };

  return JSON.stringify(config, null, 2) + '\n';
}
