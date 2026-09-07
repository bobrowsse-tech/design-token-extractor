import * as fs from 'fs/promises';
import * as path from 'path';
import { DEFAULT_CONFIG, TokenCategory } from '../types';
import { DEFAULT_CLUSTERING_OPTIONS, ClusteringOptions } from '../clustering/cluster';
import { DEFAULT_NAMING_OPTIONS, NamingOptions } from '../naming/nameGenerator';

export const CONFIG_FILENAME = '.designtokenrc.json';

export type OutputFormat = 'css' | 'scss' | 'json-dtcg' | 'tokens-studio';

export interface DesignTokenConfig {
  include: string[];
  exclude: string[];
  categories: TokenCategory[];
  outputFormats: OutputFormat[];
  outputDir: string;
  naming: NamingOptions;
  clustering: ClusteringOptions;
}

export const DEFAULT_DESIGN_TOKEN_CONFIG: DesignTokenConfig = {
  include: DEFAULT_CONFIG.include,
  exclude: DEFAULT_CONFIG.exclude,
  categories: DEFAULT_CONFIG.categories,
  outputFormats: ['css', 'scss', 'json-dtcg', 'tokens-studio'],
  outputDir: 'design-tokens',
  naming: { ...DEFAULT_NAMING_OPTIONS },
  clustering: { ...DEFAULT_CLUSTERING_OPTIONS },
};

const KNOWN_CATEGORIES = new Set<string>(DEFAULT_CONFIG.categories);
const CATEGORY_ALIASES: Record<string, TokenCategory> = {
  zindex: 'z-index',
  'z-index': 'z-index',
  fontsize: 'font-size',
  'font-size': 'font-size',
  fontfamily: 'font-family',
  'font-family': 'font-family',
  fontweight: 'font-weight',
  'font-weight': 'font-weight',
  lineheight: 'line-height',
  'line-height': 'line-height',
  letterspacing: 'letter-spacing',
  'letter-spacing': 'letter-spacing',
  opacity: 'opacity',
  border: 'border',
  typography: 'typography',
};

const KNOWN_FORMATS = new Set<OutputFormat>(['css', 'scss', 'json-dtcg', 'tokens-studio']);

export interface LoadedConfig {
  config: DesignTokenConfig;
  source: string | null;
  warnings: string[];
}

interface RawConfigFile {
  include?: unknown;
  exclude?: unknown;
  categories?: unknown;
  outputFormats?: unknown;
  outputDir?: unknown;
  naming?: { case?: unknown; prefix?: unknown };
  clustering?: {
    color?: { deltaE?: unknown };
    spacing?: { toleranceRem?: unknown };
    colorDeltaE?: unknown;
    spacingToleranceRem?: unknown;
  };
}

function asStringArray(value: unknown, warnings: string[], field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    warnings.push(`Ignored "${field}": expected an array of strings.`);
    return undefined;
  }
  return value as string[];
}

function resolveCategory(raw: string): TokenCategory | null {
  const key = raw.trim().toLowerCase();
  if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];
  if (KNOWN_CATEGORIES.has(key)) return key as TokenCategory;
  return null;
}

export function mergeConfig(raw: RawConfigFile | null, warnings: string[] = []): DesignTokenConfig {
  const merged: DesignTokenConfig = {
    include: [...DEFAULT_DESIGN_TOKEN_CONFIG.include],
    exclude: [...DEFAULT_DESIGN_TOKEN_CONFIG.exclude],
    categories: [...DEFAULT_DESIGN_TOKEN_CONFIG.categories],
    outputFormats: [...DEFAULT_DESIGN_TOKEN_CONFIG.outputFormats],
    outputDir: DEFAULT_DESIGN_TOKEN_CONFIG.outputDir,
    naming: { ...DEFAULT_DESIGN_TOKEN_CONFIG.naming },
    clustering: { ...DEFAULT_DESIGN_TOKEN_CONFIG.clustering },
  };
  if (!raw) return merged;

  const include = asStringArray(raw.include, warnings, 'include');
  if (include) merged.include = include;
  const exclude = asStringArray(raw.exclude, warnings, 'exclude');
  if (exclude) merged.exclude = exclude;

  if (raw.categories !== undefined) {
    if (!Array.isArray(raw.categories) || raw.categories.some((item) => typeof item !== 'string')) {
      warnings.push('Ignored "categories": expected an array of strings.');
    } else {
      const resolved: TokenCategory[] = [];
      for (const item of raw.categories as string[]) {
        const category = resolveCategory(item);
        if (category === 'typography') {
          resolved.push('typography', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing');
        } else if (category) {
          resolved.push(category);
        } else {
          warnings.push(`Ignored unknown category "${item}".`);
        }
      }
      if (resolved.length > 0) merged.categories = [...new Set(resolved)];
    }
  }

  if (raw.outputFormats !== undefined) {
    if (!Array.isArray(raw.outputFormats) || raw.outputFormats.some((item) => typeof item !== 'string')) {
      warnings.push('Ignored "outputFormats": expected an array of strings.');
    } else {
      const formats: OutputFormat[] = [];
      for (const item of raw.outputFormats as string[]) {
        if (KNOWN_FORMATS.has(item as OutputFormat)) formats.push(item as OutputFormat);
        else warnings.push(`Ignored unknown output format "${item}".`);
      }
      if (formats.length > 0) merged.outputFormats = formats;
    }
  }

  if (raw.outputDir !== undefined) {
    if (typeof raw.outputDir === 'string' && raw.outputDir.trim()) merged.outputDir = raw.outputDir.trim();
    else warnings.push('Ignored "outputDir": expected a non-empty string.');
  }

  if (raw.naming) {
    if (raw.naming.prefix !== undefined) {
      if (typeof raw.naming.prefix === 'string') merged.naming.prefix = raw.naming.prefix;
      else warnings.push('Ignored "naming.prefix": expected a string.');
    }
    if (raw.naming.case !== undefined && raw.naming.case !== 'kebab') {
      warnings.push('Ignored "naming.case": only "kebab" is supported.');
    }
  }

  if (raw.clustering) {
    const colorDelta = raw.clustering.color?.deltaE ?? raw.clustering.colorDeltaE;
    if (colorDelta !== undefined) {
      if (typeof colorDelta === 'number' && Number.isFinite(colorDelta) && colorDelta >= 0) {
        merged.clustering.colorDeltaE = colorDelta;
      } else {
        warnings.push('Ignored "clustering.color.deltaE": expected a non-negative number.');
      }
    }
    const spacingTol = raw.clustering.spacing?.toleranceRem ?? raw.clustering.spacingToleranceRem;
    if (spacingTol !== undefined) {
      if (typeof spacingTol === 'number' && Number.isFinite(spacingTol) && spacingTol >= 0) {
        merged.clustering.spacingToleranceRem = spacingTol;
      } else {
        warnings.push('Ignored "clustering.spacing.toleranceRem": expected a non-negative number.');
      }
    }
  }

  return merged;
}

export async function loadConfig(workspaceRoot: string): Promise<LoadedConfig> {
  const source = path.join(workspaceRoot, CONFIG_FILENAME);
  const warnings: string[] = [];
  try {
    const rawText = await fs.readFile(source, 'utf8');
    const parsed = JSON.parse(rawText) as RawConfigFile;
    return { config: mergeConfig(parsed, warnings), source, warnings };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      return { config: mergeConfig(null), source: null, warnings };
    }
    if (err instanceof SyntaxError) {
      warnings.push(`${CONFIG_FILENAME} is not valid JSON; using defaults. ${err.message}`);
      return { config: mergeConfig(null), source, warnings };
    }
    throw err;
  }
}
