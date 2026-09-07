import { describe, expect, it } from 'vitest';
import { generateTokensStudioJson } from './tokensStudioGenerator';
import { NamedToken } from '../types';

function token(partial: Partial<NamedToken> & Pick<NamedToken, 'name' | 'category' | 'value'>): NamedToken {
  return { clusterId: 'x', occurrenceCount: 1, fileCount: 1, ...partial };
}

describe('generateTokensStudioJson — composites', () => {
  it('emits a structured typography object from composite.parts', () => {
    const json = JSON.parse(generateTokensStudioJson([
      token({
        name: 'typography-button',
        category: 'typography',
        value: 'fontFamily: Arial; fontSize: 16px; fontWeight: 600; lineHeight: 1.5',
        composite: {
          kind: 'typography',
          parts: {
            fontFamily: 'Arial',
            fontSize: '16px',
            fontWeight: '600',
            lineHeight: '1.5',
          },
        },
      }),
    ]));
    expect(json.global['typography-button']).toEqual({
      type: 'typography',
      value: {
        fontFamily: 'Arial',
        fontSize: '16px',
        fontWeight: '600',
        lineHeight: '1.5',
      },
    });
  });
});
