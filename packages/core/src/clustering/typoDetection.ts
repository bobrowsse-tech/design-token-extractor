import { ProbableTypo, TokenCategory, TokenOccurrence } from '../types';

export const STANDARD_BREAKPOINTS_PX = [576, 768, 992, 1024, 1280, 1440, 1536];
export const STANDARD_FONT_SIZES_PX = [12, 14, 16, 18, 20, 24, 32, 36, 48];
export const STANDARD_LINE_HEIGHTS = [1, 1.25, 1.4, 1.5, 1.75, 2];

const BREAKPOINT_TOLERANCE_PX = 10;
const FONT_SIZE_TOLERANCE_PX = 2;
const LINE_HEIGHT_UNITLESS_TOLERANCE = 0.1;
const LINE_HEIGHT_PX_TOLERANCE = 2;

const TYPO_CATEGORIES = new Set<TokenCategory>(['breakpoint', 'font-size', 'line-height']);

export interface ParsedNumericValue {
  kind: 'px' | 'unitless';
  amount: number;
  display: string;
}

/** `z-index: 9999` / `99999` is an intentional escape hatch, not a typo. */
export function isEscapeHatchZIndex(rawValue: string): boolean {
  const trimmed = rawValue.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const n = Number(trimmed);
  return n >= 999 && /^9+$/.test(trimmed);
}

/**
 * Linear scan — do not use `\\d*\\.?\\d+` (CodeQL js/polynomial-redos).
 */
export function splitCssNumber(trimmed: string): { amount: number; rest: string } | null {
  let i = 0;
  if (trimmed.startsWith('-')) i += 1;
  let sawDigit = false;
  let sawDot = false;
  while (i < trimmed.length) {
    const code = trimmed.charCodeAt(i);
    if (code >= 48 && code <= 57) {
      sawDigit = true;
      i += 1;
      continue;
    }
    if (code === 46 && !sawDot) {
      sawDot = true;
      i += 1;
      continue;
    }
    break;
  }
  if (!sawDigit || i === (trimmed.startsWith('-') ? 1 : 0)) return null;
  const amount = Number(trimmed.slice(0, i));
  if (!Number.isFinite(amount)) return null;
  return { amount, rest: trimmed.slice(i) };
}

export function parseNumericTokenValue(rawValue: string): ParsedNumericValue | null {
  const trimmed = rawValue.trim();
  const parsed = splitCssNumber(trimmed);
  if (!parsed) return null;
  if (parsed.rest === '') {
    return { kind: 'unitless', amount: parsed.amount, display: trimmed };
  }
  const unit = parsed.rest.toLowerCase();
  if (unit !== 'px' && unit !== 'rem' && unit !== 'em') return null;
  const px = unit === 'px' ? parsed.amount : parsed.amount * 16;
  return { kind: 'px', amount: px, display: trimmed };
}

function distance(a: ParsedNumericValue, b: ParsedNumericValue): number | null {
  if (a.kind !== b.kind) return null;
  return Math.abs(a.amount - b.amount);
}

function toleranceFor(category: TokenCategory, kind: ParsedNumericValue['kind']): number {
  if (category === 'breakpoint') return BREAKPOINT_TOLERANCE_PX;
  if (category === 'font-size') return FONT_SIZE_TOLERANCE_PX;
  return kind === 'unitless' ? LINE_HEIGHT_UNITLESS_TOLERANCE : LINE_HEIGHT_PX_TOLERANCE;
}

function standardValues(category: TokenCategory, kind: ParsedNumericValue['kind']): number[] {
  if (category === 'breakpoint') return STANDARD_BREAKPOINTS_PX;
  if (category === 'font-size') return STANDARD_FONT_SIZES_PX;
  return kind === 'unitless' ? STANDARD_LINE_HEIGHTS : STANDARD_FONT_SIZES_PX.map((n) => Math.round(n * 1.5));
}

function formatStandard(category: TokenCategory, kind: ParsedNumericValue['kind'], amount: number): string {
  if (kind === 'unitless') return String(amount);
  if (category === 'breakpoint' || category === 'font-size' || category === 'line-height') {
    return Number.isInteger(amount) ? `${amount}px` : `${amount}px`;
  }
  return `${amount}px`;
}

function sameBaseSelector(a: TokenOccurrence, b: TokenOccurrence): boolean {
  return a.selector.trim() === b.selector.trim();
}

/**
 * Same selector, different media-query context — a responsive override, not a typo.
 * Example: `.card { padding: 16px }` vs `@media (min-width: 768px) { .card { padding: 24px } }`.
 */
export function isResponsiveOverridePair(a: TokenOccurrence[], b: TokenOccurrence[]): boolean {
  for (const left of a) {
    for (const right of b) {
      if (!sameBaseSelector(left, right)) continue;
      if (left.mediaQuery === right.mediaQuery) continue;
      if (left.mediaQuery || right.mediaQuery) return true;
    }
  }
  return false;
}

function isRare(count: number): boolean {
  return count <= 2;
}

function hasFrequencyAsymmetry(suspectCount: number, intendedCount: number): boolean {
  return isRare(suspectCount) && intendedCount >= 3 && intendedCount >= suspectCount * 3;
}

interface ValueGroup {
  display: string;
  parsed: ParsedNumericValue;
  count: number;
  occurrences: TokenOccurrence[];
}

/**
 * Flags rare near-duplicates that are probably typos. This is a report, not
 * a merge — it never changes clusters. z-index is intentionally excluded:
 * `9999` is a real escape-hatch pattern, not a data-entry mistake.
 */
export function detectProbableTypos(occurrences: TokenOccurrence[]): ProbableTypo[] {
  const byCategory = new Map<TokenCategory, TokenOccurrence[]>();
  for (const occ of occurrences) {
    if (!TYPO_CATEGORIES.has(occ.category)) continue;
    if (occ.category === 'z-index' && isEscapeHatchZIndex(occ.rawValue)) continue;
    const list = byCategory.get(occ.category) ?? [];
    list.push(occ);
    byCategory.set(occ.category, list);
  }

  const findings: ProbableTypo[] = [];
  const seen = new Set<string>();

  for (const [category, occs] of byCategory) {
    const groups = new Map<string, ValueGroup>();
    for (const occ of occs) {
      const parsed = parseNumericTokenValue(occ.rawValue);
      if (!parsed) continue;
      const key = `${parsed.kind}:${parsed.amount}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        existing.occurrences.push(occ);
      } else {
        groups.set(key, {
          display: occ.rawValue.trim(),
          parsed,
          count: 1,
          occurrences: [occ],
        });
      }
    }

    const groupList = [...groups.values()];
    for (const group of groupList) {
      const tol = toleranceFor(category, group.parsed.kind);

      const responsiveNeighbor = groupList.some((other) => {
        if (other === group) return false;
        const dist = distance(group.parsed, other.parsed);
        if (dist === null || dist === 0 || dist > tol) return false;
        return isResponsiveOverridePair(group.occurrences, other.occurrences);
      });
      if (responsiveNeighbor) continue;

      let bestInCorpus: { other: ValueGroup; distance: number } | null = null;
      for (const other of groupList) {
        if (other === group) continue;
        const dist = distance(group.parsed, other.parsed);
        if (dist === null || dist === 0 || dist > tol) continue;
        if (!bestInCorpus || other.count > bestInCorpus.other.count || (other.count === bestInCorpus.other.count && dist < bestInCorpus.distance)) {
          bestInCorpus = { other, distance: dist };
        }
      }

      let nearestStandard: { amount: number; distance: number } | null = null;
      for (const standard of standardValues(category, group.parsed.kind)) {
        const dist = Math.abs(group.parsed.amount - standard);
        if (dist === 0 || dist > tol) continue;
        if (!nearestStandard || dist < nearestStandard.distance) {
          nearestStandard = { amount: standard, distance: dist };
        }
      }

      const frequency = bestInCorpus
        ? hasFrequencyAsymmetry(group.count, bestInCorpus.other.count)
        : false;
      const standardHit = Boolean(nearestStandard) && isRare(group.count);

      if (!frequency && !standardHit) continue;

      let likelyIntended: string;
      let likelyIntendedCount: number;
      let dist: number;
      if (frequency && bestInCorpus) {
        likelyIntended = bestInCorpus.other.display;
        likelyIntendedCount = bestInCorpus.other.count;
        dist = bestInCorpus.distance;
      } else if (nearestStandard) {
        const standardDisplay = formatStandard(category, group.parsed.kind, nearestStandard.amount);
        const existing = groupList.find((g) => g.parsed.kind === group.parsed.kind && g.parsed.amount === nearestStandard.amount);
        likelyIntended = existing?.display ?? standardDisplay;
        likelyIntendedCount = existing?.count ?? 0;
        dist = nearestStandard.distance;
      } else {
        continue;
      }

      const reason: ProbableTypo['reason'] = frequency && standardHit ? 'both' : frequency ? 'frequency' : 'standard-value';
      const key = `${category}::${group.display}::${likelyIntended}`;
      if (seen.has(key)) continue;
      seen.add(key);

      findings.push({
        category,
        suspectValue: group.display,
        suspectCount: group.count,
        likelyIntended,
        likelyIntendedCount,
        distance: Math.round(dist * 1000) / 1000,
        reason,
      });
    }
  }

  return findings.sort((a, b) => a.suspectCount - b.suspectCount || b.likelyIntendedCount - a.likelyIntendedCount);
}
