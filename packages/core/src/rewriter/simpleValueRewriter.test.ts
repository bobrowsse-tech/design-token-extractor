import { describe, expect, it } from 'vitest';
import { rewriteSimpleOccurrences } from './simpleValueRewriter';

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

    expect(result.replacedCount).toBe(1);
    expect(result.skippedShorthandCount).toBe(1);
    expect(result.newContents).toContain('background-color: var(--color-blue-500)');
    expect(result.newContents).toContain('box-shadow: 0 4px 6px #3B82F6');
    expect(result.newContents).toContain('background-color: #3b82f6');
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
});
