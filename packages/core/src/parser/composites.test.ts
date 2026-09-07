import { describe, expect, it } from 'vitest';
import { parseTransitionComposite } from './composites';

describe('parseTransitionComposite', () => {
  it('defaults an omitted timing-function to ease', () => {
    expect(parseTransitionComposite('color 200ms')?.parts).toEqual({
      duration: '200ms',
      delay: '0s',
      timingFunction: 'ease',
    });
  });

  it('keeps steps() and linear() instead of rewriting them as ease', () => {
    expect(parseTransitionComposite('opacity 200ms steps(4, end)')?.parts.timingFunction).toBe('steps(4, end)');
    expect(parseTransitionComposite('transform 300ms linear(0, 1)')?.parts.timingFunction).toBe('linear(0, 1)');
  });

  it('does not invent a composite when the timing function is unrecognized', () => {
    expect(parseTransitionComposite('color 200ms bounce(1)')).toBeNull();
  });
});
