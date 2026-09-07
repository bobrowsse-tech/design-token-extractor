import { TokenOccurrence, ScanReport, DEFAULT_CONFIG } from './types';

export function buildReport(
  filesScanned: number,
  occurrences: TokenOccurrence[]
): ScanReport {
  const summaryByCategory = {} as ScanReport['summaryByCategory'];

  for (const category of DEFAULT_CONFIG.categories) {
    const inCategory = occurrences.filter((o) => o.category === category);
    const uniqueValues = new Set(inCategory.map((o) => o.rawValue.trim())).size;
    summaryByCategory[category] = {
      uniqueValues,
      totalOccurrences: inCategory.length,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    filesScanned,
    occurrenceCount: occurrences.length,
    occurrences,
    summaryByCategory,
  };
}
