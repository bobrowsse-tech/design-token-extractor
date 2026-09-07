import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { extractFromSource } from './extractor';
import { buildReport } from '../report';

const fixturePath = join(__dirname, '../../demo/fixtures/sample.css');
const fixtureContents = readFileSync(fixturePath, 'utf8');
const relativePath = 'demo/fixtures/sample.css';

function summarize(occurrences: { category: string; rawValue: string }[]) {
  const summary: Record<string, { totalOccurrences: number; uniqueValues: number }> = {};
  for (const o of occurrences) {
    const bucket = summary[o.category] ?? { totalOccurrences: 0, uniqueValues: 0 };
    bucket.totalOccurrences += 1;
    summary[o.category] = bucket;
  }
  for (const category of Object.keys(summary)) {
    summary[category].uniqueValues = new Set(
      occurrences.filter((o) => o.category === category).map((o) => o.rawValue)
    ).size;
  }
  return summary;
}

describe('extractFromSource (sample.css)', () => {
  const occurrences = extractFromSource(fixturePath, relativePath, fixtureContents);

  it('extracts the same category shape the dependency-free demo already proved', () => {
    const summary = summarize(occurrences);

    expect(summary.color.totalOccurrences).toBeGreaterThanOrEqual(6);
    expect(summary.spacing.totalOccurrences).toBeGreaterThanOrEqual(8);
    expect(summary.radius.totalOccurrences).toBe(3);
    expect(summary['font-size'].totalOccurrences).toBe(3);
    expect(summary['font-weight'].totalOccurrences).toBe(1);
    expect(summary['line-height'].totalOccurrences).toBe(2);
    expect(summary['font-family'].totalOccurrences).toBe(1);
    expect(summary['z-index'].totalOccurrences).toBe(1);
    expect(summary.breakpoint.totalOccurrences).toBe(2);
    expect(summary.transition.totalOccurrences).toBeGreaterThanOrEqual(2);
  });

  it('captures the fixture colors, including hex case variants and rgba() shadows', () => {
    const colors = occurrences.filter((o) => o.category === 'color').map((o) => o.rawValue);
    expect(colors).toEqual(expect.arrayContaining([
      '#3B82F6',
      '#ffffff',
      '#3b82f6',
      '#FFF',
      'rgba(0, 0, 0, 0.1)',
      'rgba(0,0,0,0.08)',
    ]));
  });

  it('captures breakpoints from @media rules, not from nested declarations', () => {
    const breakpoints = occurrences.filter((o) => o.category === 'breakpoint');
    expect(breakpoints.map((o) => o.rawValue).sort()).toEqual(['1024px', '768px']);
    expect(breakpoints.every((o) => o.property === '@media')).toBe(true);
  });

  it('fills TokenOccurrence fields the demo omitted (column + fullDeclarationValue)', () => {
    for (const o of occurrences) {
      expect(o.file).toBe(relativePath);
      expect(o.line).toBeGreaterThan(0);
      expect(o.column).toBeGreaterThan(0);
      expect(o.fullDeclarationValue.length).toBeGreaterThan(0);
      expect(o.selector.length).toBeGreaterThan(0);
    }
  });

  it('builds a Phase 1 report with the same per-category keys', () => {
    const report = buildReport(1, occurrences);
    expect(report.filesScanned).toBe(1);
    expect(report.occurrenceCount).toBe(occurrences.length);
    expect(report.summaryByCategory.color.totalOccurrences).toBeGreaterThan(0);
    expect(report.summaryByCategory.spacing.uniqueValues).toBeGreaterThan(0);
    expect(report.summaryByCategory.breakpoint.uniqueValues).toBe(2);
  });
});
