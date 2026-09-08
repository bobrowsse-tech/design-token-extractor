import { TokenOccurrence, ThemePair } from '../types';

export const DEFAULT_DARK_MARKERS = [
  '[data-theme=dark]',
  '[data-theme="dark"]',
  '[data-mode=dark]',
  '[data-color-mode=dark]',
  '[data-bs-theme=dark]',
  '.dark',
  '.dark-mode',
  '.theme-dark',
  '.night',
  '.prefers-dark',
  'prefers-color-scheme: dark',
];

function markerToRegExp(marker: string): RegExp | null {
  const trimmed = marker.trim();
  try {
    if (trimmed.startsWith('/') && trimmed.lastIndexOf('/') > 0) {
      const last = trimmed.lastIndexOf('/');
      return new RegExp(trimmed.slice(1, last), trimmed.slice(last + 1));
    }
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (trimmed.startsWith('.')) return new RegExp(`${escaped}(?![\\w-])`, 'i');
    return new RegExp(escaped, 'i');
  } catch {
    return null;
  }
}

export function compileDarkMarkers(markers: string[] = DEFAULT_DARK_MARKERS): RegExp[] {
  return [...markers]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(markerToRegExp)
    .filter((re): re is RegExp => re !== null);
}

function isDarkSelector(selector: string, markers: RegExp[]): boolean {
  return markers.some((re) => re.test(selector));
}

function stripThemeMarker(selector: string, markers: RegExp[]): string {
  let s = selector;
  for (const re of markers) s = s.replace(re, '').trim();
  return s.replace(/\s+/g, ' ').trim() || '(root)';
}

const NEARBY_LINE_WINDOW = 80;

export function detectThemePairs(
  occurrences: TokenOccurrence[],
  darkMarkers: string[] = DEFAULT_DARK_MARKERS
): ThemePair[] {
  const markers = compileDarkMarkers(darkMarkers.length > 0 ? darkMarkers : DEFAULT_DARK_MARKERS);
  const light: TokenOccurrence[] = [];
  const dark: TokenOccurrence[] = [];

  for (const occ of occurrences) {
    if (occ.category !== 'color') continue;
    if (isDarkSelector(occ.selector, markers)) dark.push(occ);
    else light.push(occ);
  }

  const pairs: ThemePair[] = [];
  for (const d of dark) {
    const baseSelector = stripThemeMarker(d.selector, markers);
    const matches = light.filter(
      (l) => l.property === d.property && stripThemeMarker(l.selector, markers) === baseSelector
    );
    if (matches.length === 0) continue;

    const nearby = matches.filter((l) => (
      l.file === d.file && Math.abs(l.line - d.line) <= NEARBY_LINE_WINDOW
    ));
    const candidates = nearby.length > 0 ? nearby : matches;
    const match = [...candidates].sort((a, b) => (
      Math.abs(a.line - d.line) - Math.abs(b.line - d.line)
    ))[0];

    if (match.rawValue.trim() === d.rawValue.trim()) continue;

    pairs.push({
      property: d.property,
      baseSelector,
      lightValue: match.rawValue.trim(),
      darkValue: d.rawValue.trim(),
      lightOccurrence: match,
      darkOccurrence: d,
      confidence: matches.length === 1 ? 'high' : 'low',
      candidateCount: matches.length,
    });
  }
  return pairs;
}
