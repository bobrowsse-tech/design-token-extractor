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

    expect(summary.color.totalOccurrences).toBeGreaterThanOrEqual(5);
    expect(summary.spacing.totalOccurrences).toBeGreaterThanOrEqual(10);
    expect(summary.radius.totalOccurrences).toBe(3);
    expect(summary['font-size'].totalOccurrences).toBe(3);
    expect(summary['font-weight'].totalOccurrences).toBe(1);
    expect(summary['line-height'].totalOccurrences).toBe(2);
    expect(summary['font-family'].totalOccurrences).toBe(1);
    expect(summary['z-index'].totalOccurrences).toBe(1);
    expect(summary.breakpoint.totalOccurrences).toBe(2);
    expect(summary.transition.totalOccurrences).toBe(1);
    expect(summary.opacity.totalOccurrences).toBe(1);
    expect(summary.shadow.totalOccurrences).toBe(2);
    expect(summary.border.totalOccurrences).toBe(1);
    expect(summary.typography.totalOccurrences).toBe(2);
  });

  it('captures the fixture colors, including hex case variants and oklch()', () => {
    const colors = occurrences.filter((o) => o.category === 'color').map((o) => o.rawValue);
    expect(colors).toEqual(expect.arrayContaining([
      '#3B82F6',
      '#ffffff',
      '#3b82f6',
      '#FFF',
      'oklch(0.7 0.1 200)',
    ]));
    expect(colors).not.toEqual(expect.arrayContaining(['rgba(0, 0, 0, 0.1)']));
  });

  it('extracts composite shadow, border, and transition as whole declarations', () => {
    const shadow = occurrences.find((o) => o.category === 'shadow' && o.selector === '.button');
    expect(shadow?.rawValue).toBe('0 4px 6px rgba(0, 0, 0, 0.1)');
    expect(shadow?.composite).toEqual({
      kind: 'shadow',
      parts: {
        offsetX: '0',
        offsetY: '4px',
        blur: '6px',
        spread: '0',
        color: 'rgba(0, 0, 0, 0.1)',
      },
    });

    const border = occurrences.find((o) => o.category === 'border');
    expect(border?.rawValue).toBe('1px solid #1d4ed8');
    expect(border?.composite?.parts).toEqual({
      width: '1px',
      style: 'solid',
      color: '#1d4ed8',
    });

    const transition = occurrences.find((o) => o.category === 'transition');
    expect(transition?.composite?.parts).toEqual({
      duration: '200ms',
      delay: '0s',
      timingFunction: 'ease-in-out',
    });
  });

  it('captures opacity, border-width, and flex-basis', () => {
    expect(occurrences.some((o) => o.category === 'opacity' && o.rawValue === '0.9')).toBe(true);
    expect(occurrences.some((o) => o.category === 'spacing' && o.property === 'border-width' && o.rawValue === '2px')).toBe(true);
    expect(occurrences.some((o) => o.category === 'spacing' && o.property === 'flex-basis' && o.rawValue === '320px')).toBe(true);
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

  it('emits a typography composite per declaration block, not per selector', () => {
    const css = `
.card { font-size: 14px; line-height: 1.4; }
@media (min-width: 768px) {
  .card { font-size: 16px; line-height: 1.5; }
}
`;
    const found = extractFromSource('blocks.css', 'blocks.css', css).filter((o) => o.category === 'typography');
    expect(found).toHaveLength(2);
    expect(found.map((o) => o.rawValue).sort()).toEqual([
      'fontSize: 14px; lineHeight: 1.4',
      'fontSize: 16px; lineHeight: 1.5',
    ]);
  });

  it('serializes typography composites in a stable part order', () => {
    const sizeFirst = extractFromSource('order-a.css', 'order-a.css', `.btn { font-size: 16px; font-family: Arial; }\n`);
    const familyFirst = extractFromSource('order-b.css', 'order-b.css', `.btn { font-family: Arial; font-size: 16px; }\n`);
    const a = sizeFirst.find((o) => o.category === 'typography');
    const b = familyFirst.find((o) => o.category === 'typography');
    expect(a?.rawValue).toBe('fontFamily: Arial; fontSize: 16px');
    expect(b?.rawValue).toBe(a?.rawValue);
  });

  it('skips custom-property definitions and still extracts unmigrated literals', () => {
    const css = `
:root { --brand-blue: #3B82F6; --space-md: 16px; }
.button { color: #EF4444; margin: 8px; }
`;
    const found = extractFromSource('partial.css', 'partial.css', css);
    expect(found.some((o) => o.property.startsWith('--'))).toBe(false);
    expect(found.some((o) => o.rawValue === '#3B82F6')).toBe(false);
    expect(found.some((o) => o.category === 'color' && o.rawValue === '#EF4444')).toBe(true);
    expect(found.some((o) => o.category === 'spacing' && o.rawValue === '8px')).toBe(true);
    expect(found.some((o) => o.rawValue === '16px')).toBe(false);
  });

  it('extracts literals from a mixed file and ignores var() usages', () => {
    const css = `
.card {
  color: var(--brand-blue);
  background: #3B82F6;
  margin: var(--space-md);
  padding: 16px;
}
`;
    const found = extractFromSource('mixed.css', 'mixed.css', css);
    const colors = found.filter((o) => o.category === 'color').map((o) => o.rawValue);
    const spacing = found.filter((o) => o.category === 'spacing').map((o) => o.rawValue);
    expect(colors).toEqual(['#3B82F6']);
    expect(spacing).toEqual(['16px']);
    expect(found.some((o) => o.rawValue.includes('var('))).toBe(false);
  });

  it('extracts the 16px inside calc() as a spacing occurrence (rewriter must still refuse it)', () => {
    const css = `.box { width: calc(100% - 16px); }\n`;
    const found = extractFromSource('calc.css', 'calc.css', css);
    expect(found.some((o) => o.category === 'spacing' && o.rawValue === '16px')).toBe(true);
    expect(found.find((o) => o.rawValue === '16px')?.fullDeclarationValue).toContain('calc(');
  });

  it('records media-query context on declarations inside @media', () => {
    const css = `
.card { padding: 16px; }
@media (min-width: 768px) {
  .card { padding: 24px; }
}
`;
    const found = extractFromSource('mq.css', 'mq.css', css).filter((o) => o.category === 'spacing');
    const base = found.find((o) => o.rawValue === '16px');
    const override = found.find((o) => o.rawValue === '24px');
    expect(base?.selector).toBe('.card');
    expect(base?.mediaQuery).toBeUndefined();
    expect(override?.selector).toBe('.card');
    expect(override?.mediaQuery).toBe('(min-width: 768px)');
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
