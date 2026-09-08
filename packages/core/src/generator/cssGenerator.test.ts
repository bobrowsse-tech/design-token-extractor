import { describe, expect, it } from 'vitest';
import { generateCssFile, generateScssFile } from '../index';
import { NamedToken } from '../types';

function token(partial: Partial<NamedToken> & Pick<NamedToken, 'name' | 'category' | 'value'>): NamedToken {
  return { clusterId: 'x', occurrenceCount: 1, fileCount: 1, ...partial };
}

const buttonType = token({
  name: 'typography-button',
  category: 'typography',
  value: 'fontFamily: "Helvetica Neue", Arial, sans-serif; fontSize: 16px; fontWeight: 600; lineHeight: 1.5',
  composite: {
    kind: 'typography',
    parts: {
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      fontSize: '16px',
      fontWeight: '600',
      lineHeight: '1.5',
    },
  },
});

describe('generateCssFile / generateScssFile — typography', () => {
  it('emits a font shorthand instead of a semicolon-separated synthetic string', () => {
    const css = generateCssFile([buttonType], 'typography');
    expect(css).toContain('--typography-button: 600 16px/1.5 "Helvetica Neue", Arial, sans-serif;');
    expect(css).not.toMatch(/--typography-button:[^;]*fontFamily:/);

    const scss = generateScssFile([buttonType], 'typography');
    expect(scss).toContain('$typography-button: 600 16px/1.5 "Helvetica Neue", Arial, sans-serif;');
    expect(scss).not.toMatch(/\$typography-button:[^;]*fontFamily:/);
  });

  it('skips typography tokens that cannot form a font shorthand', () => {
    const incomplete = token({
      name: 'typography-partial',
      category: 'typography',
      value: 'fontSize: 14px; lineHeight: 1.4',
      composite: { kind: 'typography', parts: { fontSize: '14px', lineHeight: '1.4' } },
    });
    expect(generateCssFile([incomplete], 'typography')).toBe('');
    expect(generateScssFile([incomplete], 'typography')).toBe('');
  });
});

describe('generateCssFile / generateScssFile — aliases', () => {
  it('does not overwrite a primitive when an alt token shares a semantic name', () => {
    const primary = token({
      name: 'color-background-card',
      category: 'color',
      value: '#ffffff',
      semanticName: 'color-background-card',
    });
    const alt = token({
      name: 'color-background-card-alt2',
      category: 'color',
      value: '#111111',
      semanticName: 'color-background-card',
    });
    const css = generateCssFile([primary, alt], 'color');
    expect(css).toContain('--color-background-card: #ffffff;');
    expect(css).toContain('--color-background-card-alt2: #111111;');
    expect(css).not.toMatch(/--color-background-card:\s*var\(/);

    const scss = generateScssFile([primary, alt], 'color');
    expect(scss).toContain('$color-background-card: #ffffff;');
    expect(scss).not.toMatch(/\$color-background-card:\s*\$color-background-card-alt2/);
  });

  it('emits a user alias that does not collide', () => {
    const primary = token({ name: 'color-blue-500', category: 'color', value: '#3B82F6' });
    const css = generateCssFile([primary], 'color', { 'color-blue-500': 'color-brand' });
    expect(css).toContain('--color-brand: var(--color-blue-500);');
  });
});
