import { describe, expect, it } from 'vitest';
import {
  applyRewriteReplacements,
  invertRewriteReplacements,
  rewriteSimpleOccurrences,
} from './simpleValueRewriter';

const sample = `.button {
  background-color: #3B82F6;
  color: #ffffff;
  box-shadow: 0 4px 6px #3B82F6;
}

.button--secondary {
  background-color: #3b82f6;
  border-radius: 4px;
}
`;

describe('rewriteSimpleOccurrences', () => {
  it('replaces exact-value declarations and leaves shorthand matches alone', () => {
    const result = rewriteSimpleOccurrences('rewrite-sample.css', sample, {
      targetRawValue: '#3B82F6',
      tokenName: 'color-blue-500',
      varStyle: 'css',
    });

    expect(result.replacedCount).toBe(2);
    expect(result.skippedShorthandCount).toBe(1);
    expect(result.newContents).toContain('background-color: var(--color-blue-500)');
    expect(result.newContents).toContain('box-shadow: 0 4px 6px #3B82F6');
    expect(result.newContents).not.toContain('background-color: #3b82f6');
  });

  it('replaces hex case and shorthand variants of the same color', () => {
    const source = `.a { color: #3B82F6; }\n.b { color: #3b82f6; }\n.c { color: #FFF; }\n.d { color: #ffffff; }\n`;
    const blues = rewriteSimpleOccurrences('case.css', source, {
      targetRawValue: '#3B82F6',
      tokenName: 'color-blue-500',
      varStyle: 'css',
    });
    expect(blues.replacedCount).toBe(2);
    const whites = rewriteSimpleOccurrences('case.css', source, {
      targetRawValue: '#ffffff',
      tokenName: 'color-white',
      varStyle: 'css',
    });
    expect(whites.replacedCount).toBe(2);
    expect(whites.newContents).toContain('color: var(--color-white)');
    expect(whites.newContents).not.toContain('#FFF');
  });

  it('emits SCSS variable references when asked', () => {
    const result = rewriteSimpleOccurrences('rewrite-sample.scss', 'h1 { color: #ffffff; }\n', {
      targetRawValue: '#ffffff',
      tokenName: 'color-white',
      varStyle: 'scss',
    });

    expect(result.replacedCount).toBe(1);
    expect(result.skippedShorthandCount).toBe(0);
    expect(result.newContents).toContain('color: $color-white');
  });

  it('does not rewrite when the value only appears inside a comment-adjacent shorthand', () => {
    const scssSource = `.card {
  // keep the literal in the shorthand
  box-shadow: 0 2px 4px #3B82F6;
  color: #3B82F6;
}
`;
    const result = rewriteSimpleOccurrences('card.scss', scssSource, {
      targetRawValue: '#3B82F6',
      tokenName: 'color-blue-500',
      varStyle: 'css',
    });

    expect(result.replacedCount).toBe(1);
    expect(result.skippedShorthandCount).toBe(1);
    expect(result.newContents).toContain('box-shadow: 0 2px 4px #3B82F6');
    expect(result.newContents).toContain('color: var(--color-blue-500)');
  });

  it('records per-declaration value ranges and leaves the rest of the file untouched', () => {
    const result = rewriteSimpleOccurrences('ranges.css', sample, {
      targetRawValue: '#3B82F6',
      tokenName: 'color-blue-500',
      varStyle: 'css',
    });

    expect(result.replacements).toHaveLength(2);
    expect(result.replacements.map((item) => sample.slice(item.startOffset, item.endOffset)).sort()).toEqual([
      '#3B82F6',
      '#3b82f6',
    ]);
    expect(result.newContents).toBe(applyRewriteReplacements(sample, result.replacements));
    expect(result.newContents).toContain('color: #ffffff');
    expect(result.newContents).toContain('border-radius: 4px');
  });

  it('inverts targeted replacements back to the original text (Ctrl+Z analog)', () => {
    const result = rewriteSimpleOccurrences('undo.css', sample, {
      targetRawValue: '#ffffff',
      tokenName: 'color-white',
      varStyle: 'css',
    });
    expect(result.replacedCount).toBe(1);
    const undone = applyRewriteReplacements(result.newContents, invertRewriteReplacements(result.replacements));
    expect(undone).toBe(sample);
  });

  it('replaces every exact declaration independently so an unrelated edit elsewhere is not part of the diff', () => {
    const source = `.a { color: #3B82F6; }\n.b { color: #3B82F6; }\n.c { margin: 8px; }\n`;
    const result = rewriteSimpleOccurrences('multi.css', source, {
      targetRawValue: '#3B82F6',
      tokenName: 'color-blue-500',
      varStyle: 'css',
    });
    expect(result.replacedCount).toBe(2);
    expect(result.replacements.every((item) => source.slice(item.startOffset, item.endOffset) === '#3B82F6')).toBe(true);
    expect(result.newContents).toContain('.c { margin: 8px; }');
    expect(applyRewriteReplacements(result.newContents, invertRewriteReplacements(result.replacements))).toBe(source);
  });

  it('does not rewrite a 16px match that only appears inside calc() — the whole value is not the target', () => {
    const source = `.card {\n  width: calc(100% - 16px);\n  margin: 16px;\n}\n`;
    const result = rewriteSimpleOccurrences('calc.css', source, {
      targetRawValue: '16px',
      tokenName: 'space-16',
      varStyle: 'css',
    });
    expect(result.replacedCount).toBe(1);
    expect(result.skippedShorthandCount).toBe(1);
    expect(result.newContents).toContain('width: calc(100% - 16px)');
    expect(result.newContents).toContain('margin: var(--space-16)');
  });
});
