import { describe, expect, it } from 'vitest';
import {
  expandCompositesForMode,
  normalizeCompositeValue,
  parseAllShadowLayers,
  parseShadowComposite,
  parseShadowLayer,
  parseTransitionComposite,
  serializeShadowShape,
  splitCommaLayers,
  tokenizeCompositeValue,
} from './composites';
import { TokenOccurrence } from '../types';

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

  it('parses a multi-layer transition as one whole-value composite', () => {
    const value = 'border-color 200ms ease-in-out, box-shadow 200ms ease-in-out';
    const composite = parseTransitionComposite(value);
    expect(composite?.parts.layers).toBe('2');
    expect(composite?.parts.value).toBe(value);
  });
});

describe('composite lexer', () => {
  it('does not split multi-layer rgba/oklch on inner commas', () => {
    const value = '0 4px 12px rgba(15, 23, 42, 0.18), 0 1px 2px oklch(0.4 0.1 250)';
    const layers = splitCommaLayers(value);
    expect(layers).toHaveLength(2);
    expect(layers[0]).toContain('rgba(');
    expect(layers[1]).toContain('oklch(');
    expect(parseAllShadowLayers(value)).toHaveLength(2);
  });

  it('parses inset and color-first shadows', () => {
    const inset = parseShadowLayer('inset 0 4px 8px #111827');
    expect(inset?.parts.inset).toBe('true');
    expect(inset?.parts.color).toBe('#111827');
    const colorFirst = parseShadowLayer('#111827 0 4px 8px');
    expect(colorFirst?.parts.offsetX).toBe('0');
    expect(colorFirst?.parts.color).toBe('#111827');
  });

  it('normalizes equivalent shadows before clustering', () => {
    expect(normalizeCompositeValue('0px 4px 12px rgb(0, 0, 0)')).toBe(
      normalizeCompositeValue('0 4px 12px #000000')
    );
  });

  it('parses a multi-layer shadow as one whole-value composite', () => {
    const value = '0 4px 12px rgba(15, 23, 42, 0.18), 0 1px 2px rgba(15, 23, 42, 0.08)';
    const composite = parseShadowComposite(value);
    expect(composite?.parts.layers).toBe('2');
    expect(composite?.parts.value).toBe(value);
  });

  it('does not invent spread 0 when serializing a 3-length shadow', () => {
    expect(serializeShadowShape({
      offsetX: '0',
      offsetY: '4px',
      blur: '12px',
      color: 'rgba(15, 23, 42, 0.18)',
    })).toBe('0 4px 12px');
  });

  it('keeps same-shape different-color shadows as one shape in component mode', () => {
    const occ = (value: string): TokenOccurrence => ({
      file: 'a.css',
      line: 1,
      column: 1,
      selector: '.card',
      property: 'box-shadow',
      rawValue: value,
      fullDeclarationValue: value,
      category: 'shadow',
    });
    const expanded = expandCompositesForMode([
      occ('0 4px 12px #111827'),
      { ...occ('0 4px 12px #3B82F6'), line: 2 },
    ], 'component');
    const shapes = expanded.filter((item) => item.compositeRole === 'shadow-shape').map((item) => item.rawValue);
    expect(new Set(shapes).size).toBe(1);
    expect(expanded.filter((item) => item.compositeRole === 'shadow-color')).toHaveLength(2);
  });

  it('tokenizes functions as a single token', () => {
    const tokens = tokenizeCompositeValue('0 4px rgba(15, 23, 42, 0.2)');
    expect(tokens.some((token) => token.kind === 'color' && token.raw.startsWith('rgba('))).toBe(true);
  });
});
