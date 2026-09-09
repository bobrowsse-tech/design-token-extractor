import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clusterOccurrences } from '../clustering/cluster';
import { nameClusters } from '../naming/nameGenerator';
import { applyMigrationToSource, buildMigrationPlan, needsEditorSync } from '../rewriter/migration';
import { extractFromSource } from './extractor';

const projectRoot = resolve(__dirname, '../../../../../');
const fixtures = [
  { name: 'react', file: 'playground-react/src/styles.css' },
  { name: 'vue', file: 'playground-vue/src/App.vue' },
  { name: 'angular', file: 'playground-angular/src/app/app.css' },
  { name: 'react-padding', file: 'playground-react/src/padding-only.css' },
];

describe('private retail-store playgrounds', () => {
  for (const fixture of fixtures) {
    const abs = resolve(projectRoot, fixture.file);
    const available = existsSync(abs);
    it.skipIf(!available)(`extracts padding 4px and a multi-layer shadow from ${fixture.name}`, () => {
      const source = readFileSync(abs, 'utf8');
      const occurrences = extractFromSource(abs, fixture.file, source);
      const padding = occurrences.filter((item) => item.rawValue === '4px' && item.category === 'spacing');
      expect(padding.length).toBeGreaterThan(0);
      if (!fixture.name.endsWith('padding')) {
        const shadows = occurrences.filter((item) => (
          item.property === 'box-shadow' && item.category === 'shadow'
        ));
        expect(shadows.length).toBeGreaterThan(0);
        expect(shadows.some((item) => item.composite?.kind === 'shadow')).toBe(true);
      }
    });
  }

  it.skipIf(!existsSync(resolve(projectRoot, 'playground-react/src/padding-only.css')))('applies padding: 4px on the isolated playground file', () => {
    const relative = 'playground-react/src/padding-only.css';
    const abs = resolve(projectRoot, relative);
    const source = readFileSync(abs, 'utf8');
    const occurrences = extractFromSource(abs, relative, source);
    const clusters = clusterOccurrences(occurrences);
    const tokens = nameClusters(clusters);
    const plan = buildMigrationPlan(occurrences, tokens);
    const item = plan.items.find((row) => row.rawValue === '4px');
    expect(item?.safe).toBe(true);
    const applied = applyMigrationToSource(abs, source, [{ ...item!, accepted: true }]);
    expect(applied.newContents).toMatch(/var\(--/);
    expect(needsEditorSync(source, applied.newContents)).toBe(true);
  });
});
