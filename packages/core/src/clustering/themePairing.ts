import { TokenOccurrence, ThemePair } from '../types';

// Common conventions for marking a dark-mode variant. This is intentionally
// a fixed, documented list rather than a guess — extend it here if your
// project uses a different convention (e.g. `.theme-dark`, `html.night`).
const DARK_MARKERS = [
  /\[data-theme=["']?dark["']?\]/i,
  /\.dark(\s|$|\.|>)/,
  /\.theme-dark/i,
  /prefers-color-scheme:\s*dark/i,
];

function isDarkSelector(selector: string): boolean {
  return DARK_MARKERS.some((re) => re.test(selector));
}

function stripThemeMarker(selector: string): string {
  let s = selector;
  for (const re of DARK_MARKERS) s = s.replace(re, '').trim();
  return s.replace(/\s+/g, ' ').trim() || '(root)';
}

/**
 * Finds pairs of occurrences that share a property and an otherwise-matching
 * selector (modulo a dark-mode marker), suggesting they're two sides of the
 * same theme-able design decision rather than two unrelated tokens.
 *
 * This is a SUGGESTION for the naming stage to offer a themeable token
 * (e.g. `--color-bg` overridden under `[data-theme="dark"]`) instead of two
 * disconnected primitives — never applied automatically.
 */
export function detectThemePairs(occurrences: TokenOccurrence[]): ThemePair[] {
  const light: TokenOccurrence[] = [];
  const dark: TokenOccurrence[] = [];

  for (const occ of occurrences) {
    if (occ.category !== 'color') continue;
    if (isDarkSelector(occ.selector)) dark.push(occ);
    else light.push(occ);
  }

  const pairs: ThemePair[] = [];
  for (const d of dark) {
    const baseSelector = stripThemeMarker(d.selector);
    const match = light.find(
      (l) => l.property === d.property && stripThemeMarker(l.selector) === baseSelector
    );
    if (match && match.rawValue.trim() !== d.rawValue.trim()) {
      pairs.push({
        property: d.property,
        baseSelector,
        lightValue: match.rawValue.trim(),
        darkValue: d.rawValue.trim(),
        lightOccurrence: match,
        darkOccurrence: d,
      });
    }
  }
  return pairs;
}
