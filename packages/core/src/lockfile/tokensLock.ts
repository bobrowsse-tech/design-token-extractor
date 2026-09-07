import { NamedToken, TokensLockFile, TokensLockEntry } from '../types';

/** Stable id derived from category + value, NOT from array position — so
 * re-running the scan in a different file order still produces the same
 * ids. A tiny FNV-1a hash is enough here; this never needs to be
 * cryptographically strong, just stable and collision-unlikely for the
 * number of distinct design values a real project has. */
export function computeStableId(category: string, value: string): string {
  let hash = 0x811c9dc5;
  const input = `${category}::${value}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function assignIds(tokens: NamedToken[]): NamedToken[] {
  return tokens.map((t) => ({ ...t, clusterId: computeStableId(t.category, t.value) }));
}

export function createLockFile(tokens: NamedToken[]): TokensLockFile {
  // Defensive: always (re-)derive ids from category+value here rather than
  // trusting whatever clusterId the caller happened to set. This is what
  // caught a real bug during testing — a caller that didn't already run
  // assignIds() would silently write a lockfile with wrong/empty ids, and
  // reconcileWithLockFile's lookup-by-id would then never match on the next
  // run, defeating the entire point of the lockfile. Recomputing here makes
  // createLockFile correct regardless of what the caller passes in.
  const withStableIds = assignIds(tokens);
  const now = new Date().toISOString();
  const entries: TokensLockEntry[] = withStableIds.map((t) => ({
    id: t.clusterId,
    category: t.category,
    name: t.name,
    value: t.value,
    createdAt: now,
  }));
  return { version: 1, generatedAt: now, entries };
}

export interface LockDiff {
  added: TokensLockEntry[];
  removed: TokensLockEntry[];
  renamed: Array<{ id: string; from: string; to: string }>;
  unchanged: number;
}

/**
 * Merges freshly-generated tokens against an existing lockfile:
 * - Tokens whose id already exists keep their EXISTING name (this is the
 *   whole point of the lockfile — a rescan must not reshuffle names that
 *   are already referenced in committed CSS).
 * - New ids are added.
 * - Ids that disappeared are reported as removed (caller decides whether to
 *   actually delete them — a value might be temporarily absent from a
 *   partial scan).
 */
export function reconcileWithLockFile(
  freshTokens: NamedToken[],
  existingLock: TokensLockFile | null
): { mergedLock: TokensLockFile; diff: LockDiff; resolvedTokens: NamedToken[] } {
  const fresh = assignIds(freshTokens);
  const existingById = new Map((existingLock?.entries ?? []).map((e) => [e.id, e]));
  const freshById = new Map(fresh.map((t) => [t.clusterId, t]));

  const diff: LockDiff = { added: [], removed: [], renamed: [], unchanged: 0 };
  const resolvedTokens: NamedToken[] = [];
  const now = new Date().toISOString();
  const mergedEntries: TokensLockEntry[] = [];

  for (const token of fresh) {
    const existing = existingById.get(token.clusterId);
    if (existing) {
      diff.unchanged++;
      if (existing.name !== token.name) {
        // Name would have changed (e.g. frequency ranking shifted) — keep
        // the locked name instead, and surface it as a rename the user can
        // choose to accept, rather than applying either silently.
        diff.renamed.push({ id: existing.id, from: existing.name, to: token.name });
      }
      resolvedTokens.push({ ...token, name: existing.name });
      mergedEntries.push(existing);
    } else {
      diff.added.push({ id: token.clusterId, category: token.category, name: token.name, value: token.value, createdAt: now });
      resolvedTokens.push(token);
      mergedEntries.push({ id: token.clusterId, category: token.category, name: token.name, value: token.value, createdAt: now });
    }
  }

  for (const existing of existingById.values()) {
    if (!freshById.has(existing.id)) diff.removed.push(existing);
  }

  return {
    mergedLock: { version: 1, generatedAt: now, entries: mergedEntries },
    diff,
    resolvedTokens,
  };
}
