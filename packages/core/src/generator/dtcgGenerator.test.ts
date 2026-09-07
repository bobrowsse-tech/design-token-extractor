import { describe, expect, it } from 'vitest';
import { generateDtcgJson } from './dtcgGenerator';
import { NamedToken } from '../types';

function token(partial: Partial<NamedToken> & Pick<NamedToken, 'name' | 'category' | 'value'>): NamedToken {
  return {
    clusterId: 'x',
    occurrenceCount: 1,
    fileCount: 1,
    ...partial,
  };
}

describe('generateDtcgJson — 2025.10 shapes', () => {
  it('emits color objects with srgb 0–1 components and the original CSS in $extensions', () => {
    const json = JSON.parse(generateDtcgJson([
      token({ name: 'color-blue-500', category: 'color', value: '#3B82F6' }),
    ]));
    expect(json.color['blue-500'].$type).toBe('color');
    expect(json.color['blue-500'].$value).toEqual({
      colorSpace: 'srgb',
      components: [0.231, 0.51, 0.965],
      alpha: 1,
    });
    expect(json.color['blue-500'].$extensions['design-token-extractor'].css).toBe('#3B82F6');
  });

  it('preserves authored oklch colorSpace', () => {
    const json = JSON.parse(generateDtcgJson([
      token({ name: 'color-teal-400', category: 'color', value: 'oklch(0.7 0.1 200)' }),
    ]));
    expect(json.color['teal-400'].$value).toEqual({
      colorSpace: 'oklch',
      components: [0.7, 0.1, 200],
      alpha: 1,
    });
  });

  it('emits dimension and duration objects', () => {
    const json = JSON.parse(generateDtcgJson([
      token({ name: 'space-16', category: 'spacing', value: '16px' }),
      token({ name: 'duration-200ms', category: 'transition', value: '200ms' }),
    ]));
    expect(json.spacing['space-16'].$value).toEqual({ value: 16, unit: 'px' });
    expect(json.transition['duration-200ms'].$type).toBe('duration');
    expect(json.transition['duration-200ms'].$value).toEqual({ value: 200, unit: 'ms' });
  });

  it('emits fontWeight / unitless line-height as numbers and opacity as number', () => {
    const json = JSON.parse(generateDtcgJson([
      token({ name: 'font-weight-600', category: 'font-weight', value: '600' }),
      token({ name: 'line-height-1-5', category: 'line-height', value: '1.5' }),
      token({ name: 'opacity-0-9', category: 'opacity', value: '0.9' }),
    ]));
    expect(json['font-weight']['600'].$value).toBe(600);
    expect(json['line-height']['1-5'].$value).toBe(1.5);
    expect(json.opacity['0-9'].$type).toBe('number');
    expect(json.opacity['0-9'].$value).toBe(0.9);
  });

  it('emits Format Module composite shapes', () => {
    const json = JSON.parse(generateDtcgJson([
      token({
        name: 'shadow-card',
        category: 'shadow',
        value: '0 4px 6px rgba(0, 0, 0, 0.1)',
        composite: {
          kind: 'shadow',
          parts: { offsetX: '0', offsetY: '4px', blur: '6px', spread: '0', color: 'rgba(0, 0, 0, 0.1)' },
        },
      }),
      token({
        name: 'border-1px-solid',
        category: 'border',
        value: '1px solid #1d4ed8',
        composite: { kind: 'border', parts: { width: '1px', style: 'solid', color: '#1d4ed8' } },
      }),
      token({
        name: 'transition-fade',
        category: 'transition',
        value: 'background-color 200ms ease-in-out',
        composite: {
          kind: 'transition',
          parts: { duration: '200ms', delay: '0s', timingFunction: 'ease-in-out' },
        },
      }),
      token({
        name: 'typography-button',
        category: 'typography',
        value: 'fontFamily: Helvetica; fontSize: 16px',
        composite: {
          kind: 'typography',
          parts: {
            fontFamily: '"Helvetica Neue", Arial, sans-serif',
            fontSize: '16px',
            fontWeight: '600',
            lineHeight: '1.5',
          },
        },
      }),
    ]));

    expect(json.shadow.card.$type).toBe('shadow');
    expect(json.shadow.card.$value.offsetY).toEqual({ value: 4, unit: 'px' });
    expect(json.shadow.card.$value.color.colorSpace).toBe('srgb');
    expect(json.border['1px-solid'].$value).toEqual({
      color: { colorSpace: 'srgb', components: [0.114, 0.306, 0.847], alpha: 1 },
      width: { value: 1, unit: 'px' },
      style: 'solid',
    });
    expect(json.transition.fade.$type).toBe('transition');
    expect(json.transition.fade.$value).toEqual({
      duration: { value: 200, unit: 'ms' },
      delay: { value: 0, unit: 's' },
      timingFunction: [0.42, 0, 0.58, 1],
    });
    expect(json.typography.button.$value).toEqual({
      fontFamily: ['Helvetica Neue', 'Arial', 'sans-serif'],
      fontSize: { value: 16, unit: 'px' },
      fontWeight: 600,
      lineHeight: 1.5,
    });
  });
});
