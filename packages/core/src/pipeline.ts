import { scanWorkspace } from './scanner';
import { extractFromSource } from './parser/extractor';
import { buildReport } from './report';
import { clusterOccurrences, ClusteringOptions, DEFAULT_CLUSTERING_OPTIONS } from './clustering/cluster';
import { detectThemePairs } from './clustering/themePairing';
import { nameClusters, NamingOptions, DEFAULT_NAMING_OPTIONS } from './naming/nameGenerator';
import { computeStableId, reconcileWithLockFile } from './lockfile/tokensLock';
import { checkContrast } from './a11y/contrastChecker';
import {
  ScanConfig, DEFAULT_CONFIG, TokenOccurrence, ScanReport,
  TokenCluster, NamedToken, ThemePair, ContrastFinding, TokensLockFile,
} from './types';

export interface PipelineOptions {
  scanConfig: ScanConfig;
  clustering: ClusteringOptions;
  naming: NamingOptions;
  existingLock: TokensLockFile | null;
}

export const DEFAULT_PIPELINE_OPTIONS: PipelineOptions = {
  scanConfig: DEFAULT_CONFIG,
  clustering: DEFAULT_CLUSTERING_OPTIONS,
  naming: DEFAULT_NAMING_OPTIONS,
  existingLock: null,
};

export interface PipelineResult {
  report: ScanReport;
  clusters: TokenCluster[];
  tokens: NamedToken[]; // names resolved against the lockfile
  lockFile: TokensLockFile;
  lockDiff: ReturnType<typeof reconcileWithLockFile>['diff'];
  themePairs: ThemePair[];
  contrastFindings: ContrastFinding[];
}

/** Runs scan+extract only — this is all Phase 1 does, kept as its own
 * function so the CLI/extension can offer a lightweight "just show me
 * what's there" mode without paying for clustering/naming. */
export async function scanAndExtract(
  workspaceRoot: string,
  scanConfig: ScanConfig = DEFAULT_CONFIG
): Promise<{ occurrences: TokenOccurrence[]; report: ScanReport }> {
  const files = await scanWorkspace(workspaceRoot, scanConfig);
  const allowed = new Set(scanConfig.categories);
  const occurrences: TokenOccurrence[] = [];
  for (const file of files) {
    const extracted = extractFromSource(file.absolutePath, file.relativePath, file.contents);
    occurrences.push(...extracted.filter((item) => allowed.has(item.category)));
  }
  const report = buildReport(files.length, occurrences);
  return { occurrences, report };
}

/** Full Phase 2 pipeline: scan -> extract -> cluster -> name -> reconcile
 * against tokens.lock.json -> theme pairing + contrast as a bonus pass. */
export async function runPipeline(
  workspaceRoot: string,
  options: Partial<PipelineOptions> = {}
): Promise<PipelineResult> {
  const opts: PipelineOptions = { ...DEFAULT_PIPELINE_OPTIONS, ...options };

  const { occurrences, report } = await scanAndExtract(workspaceRoot, opts.scanConfig);

  const clusters = clusterOccurrences(occurrences, opts.clustering);
  const clustersWithIds = clusters.map((c) => ({ ...c, id: computeStableId(c.category, c.canonicalValue) }));

  const namedTokens = nameClusters(clustersWithIds, opts.naming);
  const { mergedLock, diff, resolvedTokens } = reconcileWithLockFile(namedTokens, opts.existingLock);

  const themePairs = detectThemePairs(occurrences);
  const contrastFindings = checkContrast(occurrences);

  return {
    report,
    clusters: clustersWithIds,
    tokens: resolvedTokens,
    lockFile: mergedLock,
    lockDiff: diff,
    themePairs,
    contrastFindings,
  };
}
