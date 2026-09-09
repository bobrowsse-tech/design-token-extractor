import { parseColor, toHex } from '../color/colorMath';
import { TokensLockFile, TokensLockEntry, TokenCluster, NamedToken } from '../types';

export type ReviewMessage =
  | { type: 'merge'; sourceId: string; targetId: string }
  | { type: 'keep-separate'; clusterIds: string[] }
  | { type: 'rename'; id: string; name: string; previousName?: string };

export interface ReviewResolution {
  mergedWith?: string;
  keptSeparateFrom?: string[];
  renamedFrom?: string;
  name?: string;
}

export type ReviewDecisions = Record<string, ReviewResolution>;

const TOKEN_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

export function parseReviewMessage(raw: unknown): ReviewMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const message = raw as Record<string, unknown>;
  if (message.type === 'merge' && typeof message.sourceId === 'string' && typeof message.targetId === 'string') {
    return { type: 'merge', sourceId: message.sourceId, targetId: message.targetId };
  }
  if (message.type === 'keep-separate' && Array.isArray(message.clusterIds) && message.clusterIds.every((id) => typeof id === 'string')) {
    return { type: 'keep-separate', clusterIds: message.clusterIds as string[] };
  }
  if (message.type === 'rename' && typeof message.id === 'string' && typeof message.name === 'string') {
    return {
      type: 'rename',
      id: message.id,
      name: message.name,
      previousName: typeof message.previousName === 'string' ? message.previousName : undefined,
    };
  }
  return null;
}

export function applyReviewMessage(decisions: ReviewDecisions, message: ReviewMessage): ReviewDecisions {
  const next: ReviewDecisions = { ...decisions };
  const clone = (id: string): ReviewResolution => ({ ...(next[id] ?? {}) });

  if (message.type === 'merge') {
    if (!message.sourceId || !message.targetId || message.sourceId === message.targetId) return decisions;
    const source = clone(message.sourceId);
    source.mergedWith = message.targetId;
    source.keptSeparateFrom = (source.keptSeparateFrom ?? []).filter((id) => id !== message.targetId);
    if (source.keptSeparateFrom.length === 0) delete source.keptSeparateFrom;
    next[message.sourceId] = source;
    return next;
  }

  if (message.type === 'keep-separate') {
    const ids = [...new Set(message.clusterIds.filter(Boolean))];
    if (ids.length < 2) return decisions;
    for (const id of ids) {
      const others = ids.filter((other) => other !== id);
      const current = clone(id);
      const kept = new Set(current.keptSeparateFrom ?? []);
      for (const other of others) kept.add(other);
      if (current.mergedWith && ids.includes(current.mergedWith)) delete current.mergedWith;
      current.keptSeparateFrom = [...kept];
      next[id] = current;
    }
    return next;
  }

  const name = message.name.replace(/^--+/, '').trim();
  if (!TOKEN_NAME_RE.test(name)) {
    throw new Error(`Invalid token name "${message.name}". Use a name starting with a letter (kebab, camel, pascal, or snake).`);
  }
  const current = clone(message.id);
  current.name = name;
  current.renamedFrom = message.previousName ?? current.renamedFrom ?? name;
  next[message.id] = current;
  return next;
}

function compactResolution(resolution: ReviewResolution): TokensLockEntry['resolution'] | undefined {
  const next: NonNullable<TokensLockEntry['resolution']> = {};
  if (resolution.mergedWith) next.mergedWith = resolution.mergedWith;
  if (resolution.keptSeparateFrom && resolution.keptSeparateFrom.length > 0) {
    next.keptSeparateFrom = [...resolution.keptSeparateFrom];
  }
  if (resolution.renamedFrom) next.renamedFrom = resolution.renamedFrom;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function applyDecisionsToLockFile(
  lock: TokensLockFile,
  decisions: ReviewDecisions,
  tokens: NamedToken[] = []
): TokensLockFile {
  const tokensById = new Map(tokens.map((token) => [token.clusterId, token]));
  const entries = [...lock.entries];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const now = new Date().toISOString();

  for (const [id, decision] of Object.entries(decisions)) {
    let entry = byId.get(id);
    if (!entry) {
      const token = tokensById.get(id);
      if (!token) continue;
      entry = {
        id,
        category: token.category,
        name: token.name,
        value: token.value,
        createdAt: now,
      };
      entries.push(entry);
      byId.set(id, entry);
    }
    const nextEntry: TokensLockEntry = {
      ...entry,
      name: decision.name ?? entry.name,
      resolution: compactResolution({
        mergedWith: decision.mergedWith,
        keptSeparateFrom: decision.keptSeparateFrom,
        renamedFrom: decision.renamedFrom ?? entry.resolution?.renamedFrom,
      }),
    };
    const index = entries.findIndex((item) => item.id === id);
    entries[index] = nextEntry;
    byId.set(id, nextEntry);
  }

  return { ...lock, entries };
}

export interface ReviewClusterView {
  id: string;
  category: TokenCluster['category'];
  canonicalValue: string;
  memberValues: string[];
  occurrenceCount: number;
  fileCount: number;
  confidence: number;
  swatch: string | null;
}

export interface ReviewCompositeView {
  layers: number;
  shape: string;
  color: string;
  swatch: string | null;
}

export interface ReviewCard {
  kind: 'cluster-group' | 'reference-name' | 'below-threshold' | 'composite-component';
  groupId: string;
  clusters?: ReviewClusterView[];
  token?: {
    id: string;
    name: string;
    value: string;
    category: NamedToken['category'];
    referenceLabel: string;
    swatch: string | null;
  };
  composite?: ReviewCompositeView;
}

export function swatchHex(value: string): string | null {
  const rgb = parseColor(value);
  return rgb ? toHex(rgb) : null;
}

export function connectedReviewGroups(clusters: TokenCluster[]): TokenCluster[][] {
  const pending = clusters.filter((cluster) => cluster.requiresApproval && !cluster.belowThreshold);
  const byId = new Map(pending.map((cluster) => [cluster.id, cluster]));
  const seen = new Set<string>();
  const groups: TokenCluster[][] = [];

  for (const start of pending) {
    if (seen.has(start.id)) continue;
    const group: TokenCluster[] = [];
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current.id)) continue;
      seen.add(current.id);
      group.push(current);
      for (const id of current.relatedClusterIds ?? []) {
        const related = byId.get(id);
        if (related && !seen.has(related.id)) stack.push(related);
      }
    }
    groups.push(group);
  }
  return groups;
}

function toClusterView(cluster: TokenCluster): ReviewClusterView {
  return {
    id: cluster.id,
    category: cluster.category,
    canonicalValue: cluster.canonicalValue,
    memberValues: [...cluster.memberValues],
    occurrenceCount: cluster.occurrences.length,
    fileCount: new Set(cluster.occurrences.map((item) => item.file)).size,
    confidence: cluster.confidence,
    swatch: cluster.category === 'color' ? swatchHex(cluster.canonicalValue) : null,
  };
}

export function buildReviewCards(
  clusters: TokenCluster[],
  tokens: NamedToken[],
  lock: TokensLockFile | null
): ReviewCard[] {
  const lockById = new Map((lock?.entries ?? []).map((entry) => [entry.id, entry]));
  const cards: ReviewCard[] = [];

  for (const group of connectedReviewGroups(clusters)) {
    cards.push({
      kind: 'cluster-group',
      groupId: group.map((cluster) => cluster.id).sort().join('+'),
      clusters: group.map(toClusterView),
    });
  }

  for (const token of tokens) {
    if (!token.referenceMatch) continue;
    if (lockById.get(token.clusterId)?.resolution?.renamedFrom) continue;
    const source = token.referenceMatch.source === 'tailwind' ? 'Tailwind' : 'CSS';
    cards.push({
      kind: 'reference-name',
      groupId: `ref:${token.clusterId}`,
      token: {
        id: token.clusterId,
        name: token.name,
        value: token.value,
        category: token.category,
        referenceLabel: `closely matches ${source} ${token.referenceMatch.name}`,
        swatch: swatchHex(token.value),
      },
    });
  }

  for (const cluster of clusters) {
    if (!cluster.belowThreshold) continue;
    cards.push({
      kind: 'below-threshold',
      groupId: `pending:${cluster.id}`,
      clusters: [toClusterView(cluster)],
    });
  }

  const seenHints = new Set<string>();
  for (const cluster of clusters) {
    for (const occ of cluster.occurrences) {
      if (!occ.compositeHint) continue;
      const id = `comp:${occ.file}:${occ.line}:${occ.column}:${occ.property}`;
      if (seenHints.has(id)) continue;
      seenHints.add(id);
      cards.push({
        kind: 'composite-component',
        groupId: id,
        composite: {
          layers: occ.compositeHint.layers,
          shape: occ.compositeHint.shape,
          color: occ.compositeHint.color,
          swatch: swatchHex(occ.compositeHint.color),
        },
      });
    }
  }

  return cards;
}
