export type TokenCategory =
  | 'color'
  | 'spacing'
  | 'font-family'
  | 'font-size'
  | 'font-weight'
  | 'line-height'
  | 'letter-spacing'
  | 'radius'
  | 'shadow'
  | 'z-index'
  | 'breakpoint'
  | 'transition'
  | 'opacity'
  | 'border'
  | 'typography'
  | 'unknown';

export type CompositeKind = 'shadow' | 'border' | 'transition' | 'typography';

export interface TokenComposite {
  kind: CompositeKind;
  parts: Record<string, string>;
}

export type CompositeRole = 'shadow-shape' | 'shadow-color';

export interface CompositeHint {
  layers: number;
  shape: string;
  color: string;
}

export interface TokenOccurrence {
  file: string;         // path relative to workspace root
  line: number;         // 1-indexed
  column: number;       // 1-indexed
  selector: string;     // nearest enclosing rule selector (walks through nested @media)
  property: string;     // e.g. "margin", "color", "@media"
  rawValue: string;     // the exact matched substring, e.g. "#3B82F6", "16px"
  fullDeclarationValue: string; // full value of the declaration, for context
  category: TokenCategory;
  composite?: TokenComposite;
  /** Nearest enclosing `@media` params, when the declaration sits inside one. */
  mediaQuery?: string;
  /** Present when composites.mode is `component`. */
  compositeRole?: CompositeRole;
  compositeHint?: CompositeHint;
}

export interface ScanConfig {
  include: string[];
  exclude: string[];
  categories: TokenCategory[];
  /** Token output directory — always skipped during scan so generated files are not re-extracted. */
  outputDir?: string;
}

export const DEFAULT_CONFIG: ScanConfig = {
  include: [
    '**/*.css', '**/*.scss', '**/*.sass', '**/*.less',
    '**/*.vue', '**/*.html', '**/*.htm',
    '**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx',
  ],
  exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.min.css'],
  categories: [
    'color',
    'spacing',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'radius',
    'shadow',
    'z-index',
    'breakpoint',
    'transition',
    'opacity',
    'border',
    'typography',
  ],
};

export interface ScanReport {
  generatedAt: string;
  filesScanned: number;
  occurrenceCount: number;
  occurrences: TokenOccurrence[];
  // Quick pre-clustering: exact-value grouping only (no fuzzy matching yet — that's Phase 2)
  summaryByCategory: Record<TokenCategory, { uniqueValues: number; totalOccurrences: number }>;
  probableTypos: ProbableTypo[];
}

// --- Phase 2 types: clustering, naming, generation ---

/** A group of occurrences believed to represent "the same design decision".
 * `confidence` distinguishes exact-value matches (1.0, always safe) from
 * fuzzy near-value matches (<1.0, must be surfaced for human approval —
 * see the "never auto-merge" rule in the build directive). */
export interface TokenCluster {
  id: string;              // stable id, see lockfile/tokensLock.ts
  category: TokenCategory;
  canonicalValue: string;  // the representative value (most frequent, or normalized)
  memberValues: string[];  // all distinct raw values folded into this cluster
  occurrences: TokenOccurrence[];
  confidence: number;      // 1.0 = exact match, <1.0 = fuzzy match needing approval
  requiresApproval: boolean;
  /** Other cluster ids flagged as near-neighbors during the fuzzy pass. */
  relatedClusterIds?: string[];
  /** True when occurrence count is below clustering.minOccurrences. */
  belowThreshold?: boolean;
}

export interface NamedToken {
  clusterId: string;
  name: string;            // e.g. "color-blue-500", "space-4"
  category: TokenCategory;
  value: string;
  occurrenceCount: number;
  fileCount: number;
  composite?: TokenComposite;
  referenceMatch?: ColorReferenceMatch;
  /** Selector/property-derived name when one was assigned. */
  semanticName?: string;
}

/** A detected light/dark (or similar theme) pair for the same semantic slot. */
export interface ThemePair {
  property: string;
  baseSelector: string;     // selector with the theme marker stripped, for display
  lightValue: string;
  darkValue: string;
  lightOccurrence: TokenOccurrence;
  darkOccurrence: TokenOccurrence;
  /** `low` when more than one light candidate matched the stripped selector. */
  confidence: 'high' | 'low';
  candidateCount: number;
}

export interface ContrastFinding {
  selector: string;
  file: string;
  line: number;
  foreground: string;
  background: string;
  ratio: number;
  passesAA: boolean;   // >= 4.5 for normal text
  passesAAA: boolean;  // >= 7 for normal text
  /** Same-selector pairs are exact. Ancestor pairs are a parent/child heuristic. */
  pairing: 'same-selector' | 'ancestor' | 'inherited' | 'document';
}

/** A rare value that is probably a typo, not a separate design decision. */
export interface ProbableTypo {
  category: TokenCategory;
  suspectValue: string;
  suspectCount: number;
  likelyIntended: string;
  likelyIntendedCount: number;
  distance: number;
  reason: 'frequency' | 'standard-value' | 'both';
}

export interface ColorReferenceMatch {
  name: string;
  source: 'tailwind' | 'css-named';
  hex: string;
  deltaE: number;
  usedForName: boolean;
}

/** Human review recorded on a lock entry so the next scan does not re-ask. */
export interface TokensLockResolution {
  /** This cluster was merged into the token with this id. */
  mergedWith?: string;
  /** Previous name when a human renamed (or confirmed) this token. */
  renamedFrom?: string;
  /** Cluster ids explicitly kept as separate tokens. */
  keptSeparateFrom?: string[];
}

export interface TokensLockEntry {
  id: string;
  category: TokenCategory;
  name: string;
  value: string;
  createdAt: string;
  resolution?: TokensLockResolution;
}

export interface TokensLockFile {
  version: 1;
  generatedAt: string;
  entries: TokensLockEntry[];
  /** Primitive token name → semantic role (emitted as an alias). */
  semanticAliases?: Record<string, string>;
}
