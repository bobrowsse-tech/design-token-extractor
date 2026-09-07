import { TokenOccurrence, TokenCategory, TokenCluster } from '../types';
import { parseColor, deltaE76 } from '../color/colorMath';

export interface ClusteringOptions {
  colorDeltaE: number;      // default 2.0 — see build directive section 8
  spacingToleranceRem: number; // default 0.01
}

export const DEFAULT_CLUSTERING_OPTIONS: ClusteringOptions = {
  colorDeltaE: 2.0,
  spacingToleranceRem: 0.01,
};

const STRING_VALUED_CATEGORIES = new Set<TokenCategory>([
  'font-family',
  'shadow',
  'border',
  'transition',
  'typography',
]);

/** Quote style and internal whitespace are not design differences. */
export function normalizeStringValue(rawValue: string): string {
  return rawValue.trim().replace(/['"]/g, '').replace(/\s+/g, ' ');
}

/** Same hex/rgb in a different spelling is one color (`#FFF` / `#ffffff`). */
export function normalizeColorKey(rawValue: string): string | null {
  const parsed = parseColor(rawValue);
  if (!parsed) return null;
  const hex = `#${[parsed.r, parsed.g, parsed.b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
  return parsed.a < 1 ? `${hex}@${parsed.a}` : hex;
}

function normalizeKey(rawValue: string, category: TokenCategory): string {
  if (category === 'color') {
    return normalizeColorKey(rawValue) ?? rawValue.trim().toLowerCase();
  }
  if (STRING_VALUED_CATEGORIES.has(category)) {
    return normalizeStringValue(rawValue);
  }
  return rawValue.trim();
}

/**
 * Two-pass clustering:
 * 1. Exact pass — group by normalized value. Always safe, confidence 1.0.
 * 2. Fuzzy pass — for colors only (spacing fuzzy-matching is a numeric
 *    tolerance check applied to the exact-cluster canonical values).
 *    Fuzzy merges are NEVER silently applied: they come back as separate
 *    clusters with confidence < 1.0 and requiresApproval = true. The caller
 *    (CLI or extension UI) must get explicit user acceptance before treating
 *    them as one token. This mirrors "never auto-merge" from the build
 *    directive's risk section.
 */
export function clusterOccurrences(
  occurrences: TokenOccurrence[],
  options: ClusteringOptions = DEFAULT_CLUSTERING_OPTIONS
): TokenCluster[] {
  const exactGroups = new Map<string, TokenOccurrence[]>();

  for (const occ of occurrences) {
    const key = `${occ.category}::${normalizeKey(occ.rawValue, occ.category)}`;
    const list = exactGroups.get(key) ?? [];
    list.push(occ);
    exactGroups.set(key, list);
  }

  const exactClusters: TokenCluster[] = [];
  for (const occs of exactGroups.values()) {
    const category = occs[0].category;
    const canonicalValue = mostFrequentRawValue(occs);
    exactClusters.push({
      id: '', // assigned by lockfile module once names/order are stable
      category,
      canonicalValue,
      memberValues: [...new Set(occs.map((o) => o.rawValue.trim()))],
      occurrences: occs,
      confidence: 1.0,
      requiresApproval: false,
    });
  }

  // Fuzzy pass: only attempt to relate DIFFERENT exact clusters of the same
  // category that are close enough to plausibly be "the same decision,
  // typo'd or rounded differently". We do NOT merge them into one cluster —
  // we only annotate. Actual merging is a user action.
  annotateFuzzyColorNeighbors(exactClusters, options.colorDeltaE);
  annotateFuzzySpacingNeighbors(exactClusters, options.spacingToleranceRem);

  return exactClusters;
}

function mostFrequentRawValue(occs: TokenOccurrence[]): string {
  const counts = new Map<string, number>();
  for (const o of occs) counts.set(o.rawValue.trim(), (counts.get(o.rawValue.trim()) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Mutates cluster.requiresApproval/confidence in place when a near neighbor
 * exists — does not merge clusters. */
function isCompositeCluster(cluster: TokenCluster): boolean {
  return Boolean(cluster.occurrences[0]?.composite);
}

function annotateFuzzyColorNeighbors(clusters: TokenCluster[], deltaEThreshold: number) {
  const colorClusters = clusters.filter((c) => c.category === 'color' && !isCompositeCluster(c));
  for (let i = 0; i < colorClusters.length; i++) {
    const a = parseColor(colorClusters[i].canonicalValue);
    if (!a) continue;
    for (let j = i + 1; j < colorClusters.length; j++) {
      const b = parseColor(colorClusters[j].canonicalValue);
      if (!b) continue;
      const distance = deltaE76(a, b);
      if (distance > 0 && distance <= deltaEThreshold) {
        colorClusters[i].requiresApproval = true;
        colorClusters[i].confidence = Math.min(colorClusters[i].confidence, 1 - distance / (deltaEThreshold * 2));
        colorClusters[j].requiresApproval = true;
        colorClusters[j].confidence = Math.min(colorClusters[j].confidence, 1 - distance / (deltaEThreshold * 2));
      }
    }
  }
}

function parseRem(value: string): number | null {
  const m = value.trim().match(/^(-?\d*\.?\d+)(px|rem|em)$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (m[2] === 'rem' || m[2] === 'em') return num;
  return num / 16; // assume 16px base, documented assumption
}

function annotateFuzzySpacingNeighbors(clusters: TokenCluster[], toleranceRem: number) {
  const spacingClusters = clusters.filter((c) =>
    (c.category === 'spacing' || c.category === 'radius') && !isCompositeCluster(c)
  );
  for (let i = 0; i < spacingClusters.length; i++) {
    const a = parseRem(spacingClusters[i].canonicalValue);
    if (a === null) continue;
    for (let j = i + 1; j < spacingClusters.length; j++) {
      const b = parseRem(spacingClusters[j].canonicalValue);
      if (b === null) continue;
      if (Math.abs(a - b) > 0 && Math.abs(a - b) <= toleranceRem) {
        spacingClusters[i].requiresApproval = true;
        spacingClusters[i].confidence = Math.min(spacingClusters[i].confidence, 0.9);
        spacingClusters[j].requiresApproval = true;
        spacingClusters[j].confidence = Math.min(spacingClusters[j].confidence, 0.9);
      }
    }
  }
}

/** Detects an implicit spacing scale (e.g. 4/8/12/16/24/32) among spacing
 * cluster canonical values. Returns the sorted rem values that fit a common
 * step size, purely as a SUGGESTION — snapping outliers onto the scale is a
 * user-confirmed action, never automatic (per build directive risk list). */
export function detectSpacingScale(clusters: TokenCluster[]): { stepRem: number; values: number[] } | null {
  const remValues = clusters
    .filter((c) => c.category === 'spacing')
    .map((c) => parseRem(c.canonicalValue))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  if (remValues.length < 3) return null;

  // Try common step sizes (in rem) and see how many values are near-multiples.
  const candidateSteps = [0.25, 0.5, 0.125]; // 4px, 8px, 2px at 16px base
  let best: { stepRem: number; matches: number } | null = null;
  for (const step of candidateSteps) {
    let matches = 0;
    for (const v of remValues) {
      const remainder = v % step;
      if (remainder < 0.02 || step - remainder < 0.02) matches++;
    }
    if (!best || matches > best.matches) best = { stepRem: step, matches };
  }
  if (!best || best.matches < remValues.length * 0.6) return null;
  return { stepRem: best.stepRem, values: remValues };
}
