import { NamedToken, TokenCluster, TokensLockFile, TokensLockEntry } from '../types';

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
  existingLock: TokensLockFile | null,
  freshClusters: TokenCluster[] = []
): {
  mergedLock: TokensLockFile;
  diff: LockDiff;
  resolvedTokens: NamedToken[];
  resolvedClusters: TokenCluster[];
} {
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
      const added: TokensLockEntry = {
        id: token.clusterId,
        category: token.category,
        name: token.name,
        value: token.value,
        createdAt: now,
      };
      diff.added.push(added);
      resolvedTokens.push(token);
      mergedEntries.push(added);
    }
  }

  for (const existing of existingById.values()) {
    if (freshById.has(existing.id)) continue;
    // Keep merge records even when the source value is no longer a
    // separate named token, so the next scan still honours the decision.
    if (existing.resolution?.mergedWith) {
      mergedEntries.push(existing);
      continue;
    }
    diff.removed.push(existing);
  }

  const lockForResolutions: TokensLockFile = {
    version: 1,
    generatedAt: now,
    entries: mergedEntries,
    semanticAliases: existingLock?.semanticAliases,
  };
  const resolvedClusters = applyLockResolutionsToClusters(freshClusters, lockForResolutions);
  const tokensAfterMerge = applyLockMergesToTokens(resolvedTokens, lockForResolutions);

  return {
    mergedLock: lockForResolutions,
    diff,
    resolvedTokens: tokensAfterMerge,
    resolvedClusters,
  };
}

function cloneCluster(cluster: TokenCluster): TokenCluster {
  return {
    ...cluster,
    memberValues: [...cluster.memberValues],
    occurrences: [...cluster.occurrences],
    relatedClusterIds: cluster.relatedClusterIds ? [...cluster.relatedClusterIds] : [],
  };
}

function pairResolved(leftId: string, rightId: string, lockById: Map<string, TokensLockEntry>): boolean {
  const left = lockById.get(leftId);
  const right = lockById.get(rightId);
  if (left?.resolution?.mergedWith === rightId || right?.resolution?.mergedWith === leftId) return true;
  if (left?.resolution?.keptSeparateFrom?.includes(rightId)) return true;
  if (right?.resolution?.keptSeparateFrom?.includes(leftId)) return true;
  return false;
}

export function applyLockResolutionsToClusters(
  clusters: TokenCluster[],
  lock: TokensLockFile | null
): TokenCluster[] {
  if (clusters.length === 0) return [];
  const byId = new Map(clusters.map((cluster) => [cluster.id, cloneCluster(cluster)]));
  const lockById = new Map((lock?.entries ?? []).map((entry) => [entry.id, entry]));

  for (const entry of lock?.entries ?? []) {
    const targetId = entry.resolution?.mergedWith;
    if (!targetId) continue;
    const source = byId.get(entry.id);
    const target = byId.get(targetId);
    if (!source || !target) continue;
    target.occurrences.push(...source.occurrences);
    target.memberValues = [...new Set([...target.memberValues, ...source.memberValues])];
    target.relatedClusterIds = [...new Set([
      ...(target.relatedClusterIds ?? []),
      ...(source.relatedClusterIds ?? []).filter((id) => id !== target.id && id !== source.id),
    ])];
    byId.delete(entry.id);
  }

  for (const cluster of byId.values()) {
    cluster.relatedClusterIds = (cluster.relatedClusterIds ?? [])
      .map((id) => {
        const mergedInto = lockById.get(id)?.resolution?.mergedWith;
        return byId.has(id) ? id : (mergedInto && byId.has(mergedInto) ? mergedInto : id);
      })
      .filter((id) => id !== cluster.id && byId.has(id));
    const unresolved = cluster.relatedClusterIds.filter((id) => !pairResolved(cluster.id, id, lockById));
    if (cluster.requiresApproval && unresolved.length === 0) {
      cluster.requiresApproval = false;
      cluster.confidence = 1;
    }
    cluster.relatedClusterIds = unresolved;
  }

  return [...byId.values()];
}

function applyLockMergesToTokens(tokens: NamedToken[], lock: TokensLockFile): NamedToken[] {
  const byId = new Map(tokens.map((token) => [token.clusterId, { ...token }]));
  for (const entry of lock.entries) {
    const targetId = entry.resolution?.mergedWith;
    if (!targetId) continue;
    const source = byId.get(entry.id);
    const target = byId.get(targetId);
    if (source && target) {
      target.occurrenceCount += source.occurrenceCount;
      target.fileCount = Math.max(target.fileCount, source.fileCount);
    }
    byId.delete(entry.id);
  }
  return [...byId.values()];
}

const TOKEN_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** Updates a lock entry's name. Ids stay value-derived; the next reconcile keeps this name. */
export function renameLockEntry(lock: TokensLockFile, id: string, newName: string): TokensLockFile {
  const name = newName.replace(/^--+/, '').trim();
  if (!TOKEN_NAME_RE.test(name)) {
    throw new Error(`Invalid token name "${newName}". Use a name starting with a letter (kebab, camel, pascal, or snake).`);
  }
  const entries = lock.entries.map((entry) => (entry.id === id
    ? {
      ...entry,
      name,
      resolution: {
        ...entry.resolution,
        renamedFrom: entry.resolution?.renamedFrom ?? entry.name,
      },
    }
    : entry));
  if (entries.every((entry, i) => entry === lock.entries[i])) {
    throw new Error(`No lock entry with id "${id}".`);
  }
  return { ...lock, entries };
}
