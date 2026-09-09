import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { extractFromSource } from '../parser/extractor';
import { TokenOccurrence } from '../types';
import {
  applyMigrationPlan,
  applyMigrationToSource,
  backupDiffTitle,
  buildMigrationPlan,
  classifyRewriteSafety,
  MigrationItem,
  needsEditorSync,
} from './migration';

function occ(partial: Partial<TokenOccurrence>): TokenOccurrence {
  return {
    file: 'src/app.css',
    line: 2,
    column: 3,
    selector: '.button',
    property: 'color',
    rawValue: '#3B82F6',
    fullDeclarationValue: '#3B82F6',
    category: 'color',
    ...partial,
  };
}

describe('classifyRewriteSafety', () => {
  it('allows an exact single-value declaration', () => {
    expect(classifyRewriteSafety(occ({}))).toBeNull();
  });

  it('treats unique shorthand/calc/media literals as assisted-safe and still flags the rest', () => {
    expect(classifyRewriteSafety(occ({
      property: 'box-shadow',
      fullDeclarationValue: '0 4px 6px #3B82F6',
    }))).toBeNull();
    expect(classifyRewriteSafety(occ({
      property: 'width',
      rawValue: '16px',
      fullDeclarationValue: 'calc(16px + 1rem)',
      category: 'spacing',
    }))).toBeNull();
    expect(classifyRewriteSafety(occ({ property: '--brand' }))).toBe('custom-property-definition');
    expect(classifyRewriteSafety(occ({ property: '-webkit-border-radius', category: 'radius' }))).toBe('vendor-prefix');
    expect(classifyRewriteSafety(occ({
      property: '@media',
      category: 'breakpoint',
      rawValue: '768px',
      fullDeclarationValue: '(min-width: 768px)',
    }))).toBeNull();
    expect(classifyRewriteSafety(occ({
      property: 'margin',
      rawValue: '8px',
      fullDeclarationValue: '8px 8px',
      category: 'spacing',
    }))).toBe('ambiguous');
    expect(classifyRewriteSafety(occ({
      property: 'box-shadow',
      rawValue: '2px',
      fullDeclarationValue: '0 4px 12px rgba(15, 23, 42, 0.18), 0 1px 2px rgba(15, 23, 42, 0.08)',
      category: 'shadow',
    }))).toBeNull();
  });
});

describe('buildMigrationPlan + applyMigrationToSource', () => {
  const css = `.button {
  background-color: #3B82F6;
  color: #ffffff;
  box-shadow: 0 4px 6px #3B82F6;
  width: calc(16px + 1rem);
}
`;

  it('accepts only safe exact replacements by default', () => {
    const plan = buildMigrationPlan([
      occ({ line: 2, column: 3, property: 'background-color', rawValue: '#3B82F6', fullDeclarationValue: '#3B82F6' }),
      occ({ line: 3, column: 3, property: 'color', rawValue: '#ffffff', fullDeclarationValue: '#ffffff', category: 'color' }),
      occ({ line: 4, column: 3, property: 'box-shadow', rawValue: '#3B82F6', fullDeclarationValue: '0 4px 6px #3B82F6' }),
    ], [
      { clusterId: '', name: 'color-blue-500', category: 'color', value: '#3B82F6', occurrenceCount: 1, fileCount: 1 },
      { clusterId: '', name: 'color-gray-50', category: 'color', value: '#ffffff', occurrenceCount: 1, fileCount: 1 },
    ], (category, value) => `${category}-${value}`);

    expect(plan.items.filter((i) => i.safe).map((i) => i.property)).toEqual(['background-color', 'color', 'box-shadow']);
    expect(plan.items.find((i) => i.property === 'box-shadow')?.assisted).toBe(true);
  });

  it('rewrites only accepted exact declarations at the AST node', () => {
    const occurrences = extractFromSource('src/app.css', 'src/app.css', css);
    const plan = buildMigrationPlan(occurrences, [
      { clusterId: '', name: 'color-blue-500', category: 'color', value: '#3B82F6', occurrenceCount: 1, fileCount: 1 },
      { clusterId: '', name: 'color-white', category: 'color', value: '#ffffff', occurrenceCount: 1, fileCount: 1 },
    ], () => 'unused');

    for (const item of plan.items) {
      item.accepted = item.safe && item.property === 'background-color';
    }

    const result = applyMigrationToSource('src/app.css', css, plan.items);
    expect(result.replacedCount).toBe(1);
    expect(result.newContents).toContain('background-color: var(--color-blue-500)');
    expect(result.newContents).toContain('color: #ffffff');
    expect(result.newContents).toContain('box-shadow: 0 4px 6px #3B82F6');
    expect(result.newContents).toMatch(/width: calc\(/);
  });

  it('applies unique shorthand and calc replacements when they are accepted', () => {
    const source = `.button {
  background-color: #3B82F6;
  box-shadow: 0 4px 6px #3B82F6, 0 1px 2px #111111;
  width: calc(16px + 1rem);
}
`;
    const occurrences = extractFromSource('src/app.css', 'src/app.css', source);
    const shadow = occurrences.find((item) => item.category === 'shadow' && item.property === 'box-shadow');
    expect(shadow?.composite?.kind).toBe('shadow');
    const plan = buildMigrationPlan(occurrences, [
      { clusterId: '', name: 'color-blue-500', category: 'color', value: '#3B82F6', occurrenceCount: 1, fileCount: 1 },
      { clusterId: '', name: 'space-16', category: 'spacing', value: '16px', occurrenceCount: 1, fileCount: 1 },
      {
        clusterId: '',
        name: 'shadow-button',
        category: 'shadow',
        value: shadow?.rawValue ?? '',
        occurrenceCount: 1,
        fileCount: 1,
      },
    ], () => 'unused');

    for (const item of plan.items) {
      item.accepted = item.safe && (
        item.property === 'background-color'
        || item.property === 'box-shadow'
        || (item.property === 'width' && item.rawValue === '16px')
      );
    }

    const result = applyMigrationToSource('src/app.css', source, plan.items);
    expect(result.replacedCount).toBeGreaterThanOrEqual(2);
    expect(result.newContents).toContain('background-color: var(--color-blue-500)');
    expect(result.newContents).toContain('box-shadow: var(--shadow-button)');
    expect(result.newContents).toContain('width: calc(var(--space-16) + 1rem)');
  });

  it('treats a parsed shadow composite as a safe whole-declaration replacement', () => {
    expect(classifyRewriteSafety(occ({
      property: 'box-shadow',
      category: 'shadow',
      rawValue: '0 4px 6px #3B82F6',
      fullDeclarationValue: '0 4px 6px #3B82F6',
      composite: {
        kind: 'shadow',
        parts: { offsetX: '0', offsetY: '4px', blur: '6px', color: '#3B82F6' },
      },
    }))).toBeNull();
    expect(classifyRewriteSafety(occ({
      property: 'typography',
      category: 'typography',
      rawValue: 'fontFamily: Arial; fontSize: 16px',
      fullDeclarationValue: 'fontFamily: Arial; fontSize: 16px',
      composite: { kind: 'typography', parts: { fontFamily: 'Arial', fontSize: '16px' } },
    }))).toBe('shorthand');
  });

  it('rewrites Vue/HTML/JS without parsing the whole file as CSS', () => {
    const vue = `<template>
  <div class="bg-[#3B82F6]">Hi</div>
</template>
<style>
.card { color: #111111; }
</style>
`;
    const occurrences = extractFromSource('Card.vue', 'Card.vue', vue);
    const plan = buildMigrationPlan(occurrences, [
      { clusterId: '', name: 'color-blue-500', category: 'color', value: '#3B82F6', occurrenceCount: 1, fileCount: 1 },
      { clusterId: '', name: 'color-gray-900', category: 'color', value: '#111111', occurrenceCount: 1, fileCount: 1 },
    ], () => 'unused');
    for (const item of plan.items) item.accepted = item.safe;

    const result = applyMigrationToSource('Card.vue', vue, plan.items);
    expect(result.replacedCount).toBeGreaterThanOrEqual(2);
    expect(result.newContents).toContain('<template>');
    expect(result.newContents).toContain('bg-[var(--color-blue-500)]');
    expect(result.newContents).toContain('color: var(--color-gray-900)');
    expect(result.newContents).toContain('</style>');
  });
});

describe('applyMigrationPlan', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it('keeps same-relative-path files in different roots separate', async () => {
    const first = await fs.mkdtemp(path.join(os.tmpdir(), 'dte-mig-a-'));
    const second = await fs.mkdtemp(path.join(os.tmpdir(), 'dte-mig-b-'));
    dirs.push(first, second);
    await fs.mkdir(path.join(first, 'src'), { recursive: true });
    await fs.mkdir(path.join(second, 'src'), { recursive: true });
    const firstCss = '.x { color: #111111; }\n';
    const secondCss = '.x { color: #ffffff; }\n';
    await fs.writeFile(path.join(first, 'src/app.css'), firstCss, 'utf8');
    await fs.writeFile(path.join(second, 'src/app.css'), secondCss, 'utf8');

    const item = (root: string, css: string, tokenName: string): MigrationItem => {
      const occurrence = extractFromSource('src/app.css', 'src/app.css', css)[0];
      return {
        id: tokenName,
        file: 'src/app.css',
        line: occurrence.line,
        column: occurrence.column,
        selector: occurrence.selector,
        property: occurrence.property,
        rawValue: occurrence.rawValue,
        fullDeclarationValue: occurrence.fullDeclarationValue,
        category: occurrence.category,
        tokenName,
        replacement: `var(--${tokenName})`,
        safe: true,
        accepted: true,
        root,
      };
    };

    const result = await applyMigrationPlan(first, {
      version: 1,
      generatedAt: '',
      items: [
        item(first, firstCss, 'color-gray-900'),
        item(second, secondCss, 'color-white'),
      ],
    });

    expect(result.replacedCount).toBe(2);
    expect(await fs.readFile(path.join(first, 'src/app.css'), 'utf8')).toContain('var(--color-gray-900)');
    expect(await fs.readFile(path.join(second, 'src/app.css'), 'utf8')).toContain('var(--color-white)');
    expect(await fs.readFile(path.join(first, 'src/app.css'), 'utf8')).not.toContain('#ffffff');
    expect(await fs.readFile(path.join(second, 'src/app.css'), 'utf8')).not.toContain('#111111');
    expect(result.writes).toHaveLength(2);
    expect(result.writes.every((write) => write.contents.includes('var(--'))).toBe(true);
  });

  it('extracts, plans, and applies padding: 4px', async () => {
    const css = '.price { padding: 4px; }\n';
    const occurrences = extractFromSource('src/app.css', 'src/app.css', css);
    const padding = occurrences.find((item) => item.rawValue === '4px' && item.category === 'spacing');
    expect(padding).toBeTruthy();
    const plan = buildMigrationPlan(occurrences, [
      {
        clusterId: 'space-1',
        name: 'space-1',
        category: 'spacing',
        value: '4px',
        occurrenceCount: 1,
        fileCount: 1,
      },
    ]);
    const item = plan.items.find((row) => row.rawValue === '4px');
    expect(item?.safe).toBe(true);
    const applied = applyMigrationToSource('src/app.css', css, [{ ...item!, accepted: true }]);
    expect(applied.replacedCount).toBe(1);
    expect(applied.newContents).toContain('var(--space-1)');
    expect(needsEditorSync(css, applied.newContents)).toBe(true);
    expect(needsEditorSync(applied.newContents, applied.newContents)).toBe(false);
    expect(backupDiffTitle('src/app.css')).toBe('src/app.css (Backup ↔ Current)');
  });
});
