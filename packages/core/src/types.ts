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

export interface TokenOccurrence {
  file: string;         // path relative to workspace root
  line: number;         // 1-indexed
  column: number;       // 1-indexed
  selector: string;     // nearest enclosing selector or at-rule, for context
  property: string;     // e.g. "margin", "color", "@media"
  rawValue: string;     // the exact matched substring, e.g. "#3B82F6", "16px"
  fullDeclarationValue: string; // full value of the declaration, for context
  category: TokenCategory;
  composite?: TokenComposite;
}

export interface ScanConfig {
  include: string[];
  exclude: string[];
  categories: TokenCategory[];
}

export const DEFAULT_CONFIG: ScanConfig = {
  include: ['**/*.css', '**/*.scss', '**/*.sass', '**/*.less'],
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
}

export interface NamedToken {
  clusterId: string;
  name: string;            // e.g. "color-blue-500", "space-4"
  category: TokenCategory;
  value: string;
  occurrenceCount: number;
  fileCount: number;
  composite?: TokenComposite;
}

/** A detected light/dark (or similar theme) pair for the same semantic slot. */
export interface ThemePair {
  property: string;
  baseSelector: string;     // selector with the theme marker stripped, for display
  lightValue: string;
  darkValue: string;
  lightOccurrence: TokenOccurrence;
  darkOccurrence: TokenOccurrence;
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
}

export interface TokensLockEntry {
  id: string;
  category: TokenCategory;
  name: string;
  value: string;
  createdAt: string;
}

export interface TokensLockFile {
  version: 1;
  generatedAt: string;
  entries: TokensLockEntry[];
}
