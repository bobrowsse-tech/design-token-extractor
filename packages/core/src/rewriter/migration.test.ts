import { describe, expect, it } from 'vitest';
import { extractFromSource } from '../parser/extractor';
import { TokenOccurrence } from '../types';
import {
  applyMigrationToSource,
  buildMigrationPlan,
  classifyRewriteSafety,
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

  it('flags shorthand, calc(), custom properties, vendor prefixes, and breakpoints', () => {
    expect(classifyRewriteSafety(occ({
      property: 'box-shadow',
      fullDeclarationValue: '0 4px 6px #3B82F6',
    }))).toBe('shorthand');
    expect(classifyRewriteSafety(occ({
      property: 'width',
      rawValue: '16px',
      fullDeclarationValue: 'calc(16px + 1rem)',
      category: 'spacing',
    }))).toBe('calc');
    expect(classifyRewriteSafety(occ({ property: '--brand' }))).toBe('custom-property-definition');
    expect(classifyRewriteSafety(occ({ property: '-webkit-border-radius', category: 'radius' }))).toBe('vendor-prefix');
    expect(classifyRewriteSafety(occ({
      property: '@media',
      category: 'breakpoint',
      rawValue: '768px',
      fullDeclarationValue: '(min-width: 768px)',
    }))).toBe('media-breakpoint');
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

    expect(plan.items.filter((i) => i.safe).map((i) => i.property)).toEqual(['background-color', 'color']);
    expect(plan.items.find((i) => i.property === 'box-shadow')?.accepted).toBe(false);
  });

  it('rewrites only accepted exact declarations at the AST node', () => {
    const occurrences = extractFromSource('src/app.css', 'src/app.css', css);
    const plan = buildMigrationPlan(occurrences, [
      { clusterId: '', name: 'color-blue-500', category: 'color', value: '#3B82F6', occurrenceCount: 1, fileCount: 1 },
      { clusterId: '', name: 'color-white', category: 'color', value: '#ffffff', occurrenceCount: 1, fileCount: 1 },
    ], () => 'unused');

    const colorItem = plan.items.find((i) => i.property === 'color' && i.safe);
    if (colorItem) colorItem.accepted = false;

    const result = applyMigrationToSource('src/app.css', css, plan.items);
    expect(result.replacedCount).toBe(1);
    expect(result.newContents).toContain('background-color: var(--color-blue-500)');
    expect(result.newContents).toContain('color: #ffffff');
    expect(result.newContents).toContain('box-shadow: 0 4px 6px #3B82F6');
    expect(result.newContents).toContain('width: calc(16px + 1rem)');
  });
});
