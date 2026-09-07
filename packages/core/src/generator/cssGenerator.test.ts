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
