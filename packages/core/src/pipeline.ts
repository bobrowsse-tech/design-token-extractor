import {
  scanWorkspace,
  loadScanCache,
  writeScanCache,
  cacheFingerprintMatches,
  effectiveExclude,
  SCAN_CACHE_VERSION,
  ScanCache,
} from './scanner';
import { extractFromSource } from './parser/extractor';
import { buildReport } from './report';
import { clusterOccurrences, linkRelatedClusterIds, ClusteringOptions, DEFAULT_CLUSTERING_OPTIONS } from './clustering/cluster';
import { detectThemePairs } from './clustering/themePairing';
import { nameClusters, NamingOptions, DEFAULT_NAMING_OPTIONS } from './naming/nameGenerator';
import { computeStableId, reconcileWithLockFile } from './lockfile/tokensLock';
import { checkContrast } from './a11y/contrastChecker';
import { applySemanticAliasesToTokens } from './rewriter/semanticAliases';
import {
  ScanConfig, DEFAULT_CONFIG, TokenOccurrence, ScanReport,
  TokenCluster, NamedToken, ThemePair, ContrastFinding, TokensLockFile, ProbableTypo,
} from './types';

export interface PipelineOptions {
  scanConfig: ScanConfig;
  clustering: ClusteringOptions;
  naming: NamingOptions;
  existingLock: TokensLockFile | null;
  themeDarkMarkers?: string[];
  persistScanCache?: boolean;
}

export const DEFAULT_PIPELINE_OPTIONS: PipelineOptions = {
  scanConfig: DEFAULT_CONFIG,
  clustering: DEFAULT_CLUSTERING_OPTIONS,
  naming: DEFAULT_NAMING_OPTIONS,
  existingLock: null,
  persistScanCache: true,
};

export interface PipelineResult {
  report: ScanReport;
  clusters: TokenCluster[];
  /** Clusters after ids + neighbor links, before lock resolutions. */
  freshClusters: TokenCluster[];
  tokens: NamedToken[]; // names resolved against the lockfile
  /** Named tokens before lock merge/rename resolution. */
  freshTokens: NamedToken[];
  lockFile: TokensLockFile;
  lockDiff: ReturnType<typeof reconcileWithLockFile>['diff'];
  themePairs: ThemePair[];
  contrastFindings: ContrastFinding[];
  probableTypos: ProbableTypo[];
  reusedFileCount: number;
}

export async function scanAndExtract(
  workspaceRoot: string,
  scanConfig: ScanConfig = DEFAULT_CONFIG,
  options: { persistScanCache?: boolean } = {}
): Promise<{ occurrences: TokenOccurrence[]; report: ScanReport; reusedFileCount: number }> {
  const previous = await loadScanCache(workspaceRoot);
  const { files, reusedCount } = await scanWorkspace(workspaceRoot, scanConfig, previous);
  const allowed = new Set(scanConfig.categories);
  const occurrences: TokenOccurrence[] = [];
  const nextCache: ScanCache = {
    version: SCAN_CACHE_VERSION,
    include: [...scanConfig.include],
    exclude: effectiveExclude(scanConfig),
    files: {},
  };

  for (const file of files) {
    if (file.reused && previous && cacheFingerprintMatches(previous, scanConfig) && previous.files[file.relativePath]) {
      const cached = previous.files[file.relativePath].occurrences.filter((item) => allowed.has(item.category));
      occurrences.push(...cached);
      nextCache.files[file.relativePath] = previous.files[file.relativePath];
      continue;
    }
    const extracted = extractFromSource(file.absolutePath, file.relativePath, file.contents);
    occurrences.push(...extracted.filter((item) => allowed.has(item.category)));
    nextCache.files[file.relativePath] = {
      mtimeMs: file.mtimeMs,
      size: file.size,
      occurrences: extracted,
    };
  }

  if (options.persistScanCache !== false) {
    await writeScanCache(workspaceRoot, nextCache);
  }

  const report = buildReport(files.length, occurrences);
  return { occurrences, report, reusedFileCount: reusedCount };
}

export async function runPipeline(
  workspaceRoot: string,
  options: Partial<PipelineOptions> = {}
): Promise<PipelineResult> {
  const opts: PipelineOptions = { ...DEFAULT_PIPELINE_OPTIONS, ...options };

  const { occurrences, report, reusedFileCount } = await scanAndExtract(workspaceRoot, opts.scanConfig, {
    persistScanCache: opts.persistScanCache,
  });

  const clusters = clusterOccurrences(occurrences, opts.clustering);
  const clustersWithIds = linkRelatedClusterIds(
    clusters.map((c) => ({ ...c, id: computeStableId(c.category, c.canonicalValue) })),
    opts.clustering
  );

  const namedTokens = nameClusters(clustersWithIds, opts.naming);
  const { mergedLock, diff, resolvedTokens, resolvedClusters } = reconcileWithLockFile(
    namedTokens,
    opts.existingLock,
    clustersWithIds
  );
  const tokens = applySemanticAliasesToTokens(resolvedTokens, mergedLock.semanticAliases);

  const themePairs = detectThemePairs(occurrences, opts.themeDarkMarkers);
  const contrastFindings = checkContrast(occurrences);

  return {
    report,
    clusters: resolvedClusters,
    freshClusters: clustersWithIds,
    tokens,
    freshTokens: namedTokens,
    lockFile: mergedLock,
    lockDiff: diff,
    themePairs,
    contrastFindings,
    probableTypos: report.probableTypos,
    reusedFileCount,
  };
}
