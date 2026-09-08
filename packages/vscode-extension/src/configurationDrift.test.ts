import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLUSTERING_OPTIONS,
  DEFAULT_DESIGN_TOKEN_CONFIG,
  DEFAULT_NAMING_OPTIONS,
} from '../../core/src/index';

describe('package.json configuration defaults', () => {
  it('match core DEFAULT_DESIGN_TOKEN_CONFIG / clustering / naming constants', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
      contributes: { configuration: { properties: Record<string, { default: unknown }> } };
    };
    const props = pkg.contributes.configuration.properties;

    expect(props['designTokens.include'].default).toEqual(DEFAULT_DESIGN_TOKEN_CONFIG.include);
    expect(props['designTokens.exclude'].default).toEqual(DEFAULT_DESIGN_TOKEN_CONFIG.exclude);
    expect(props['designTokens.outputDir'].default).toBe(DEFAULT_DESIGN_TOKEN_CONFIG.outputDir);
    expect(props['designTokens.naming.case'].default).toBe(DEFAULT_NAMING_OPTIONS.case);
    expect(props['designTokens.naming.prefix'].default).toBe(DEFAULT_NAMING_OPTIONS.prefix);
    expect(props['designTokens.clustering.colorDeltaE'].default).toBe(DEFAULT_CLUSTERING_OPTIONS.colorDeltaE);
    expect(props['designTokens.clustering.spacingToleranceRem'].default).toBe(DEFAULT_CLUSTERING_OPTIONS.spacingToleranceRem);
    expect(props['designTokens.codeLens.enabled'].default).toBe(true);
    expect(props['designTokens.theme.darkMarkers'].default).toEqual(DEFAULT_DESIGN_TOKEN_CONFIG.theme.darkMarkers);
  });
});
