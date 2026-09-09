import { describe, expect, it } from 'vitest';
import { countBoundedLiterals, indexOfBoundedLiteral, isBoundedLiteral } from './boundedLiteral';

describe('bounded literals', () => {
  const shadow = '0 4px 12px rgba(15, 23, 42, 0.18), 0 1px 2px rgba(15, 23, 42, 0.08)';

  it('does not count 2px inside 12px', () => {
    expect(countBoundedLiterals(shadow, '2px')).toBe(1);
    expect(countBoundedLiterals(shadow, '12px')).toBe(1);
    expect(isBoundedLiteral('12px', 1, '2px')).toBe(false);
  });

  it('finds the real 2px after 12px', () => {
    const index = indexOfBoundedLiteral(shadow, '2px');
    expect(shadow.slice(index, index + 3)).toBe('2px');
    expect(shadow.slice(Math.max(0, index - 2), index)).not.toBe('1');
    expect(index).toBeGreaterThan(shadow.indexOf('12px'));
  });
});
