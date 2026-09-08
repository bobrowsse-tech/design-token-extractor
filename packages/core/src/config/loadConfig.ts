import * as fs from 'fs/promises';
import * as path from 'path';
import { DEFAULT_CONFIG, TokenCategory } from '../types';
import { DEFAULT_CLUSTERING_OPTIONS, ClusteringOptions } from '../clustering/cluster';
import { DEFAULT_NAMING_OPTIONS, NamingCase, NamingOptions } from '../naming/nameGenerator';
import { DEFAULT_DARK_MARKERS } from '../clustering/themePairing';

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
  theme: { darkMarkers: string[] };
}

export const DEFAULT_DESIGN_TOKEN_CONFIG: DesignTokenConfig = {
  include: DEFAULT_CONFIG.include,
  exclude: DEFAULT_CONFIG.exclude,
  categories: DEFAULT_CONFIG.categories,
  outputFormats: ['css', 'scss', 'json-dtcg', 'tokens-studio'],
  outputDir: 'design-tokens',
  naming: { ...DEFAULT_NAMING_OPTIONS },
  clustering: { ...DEFAULT_CLUSTERING_OPTIONS },
  theme: { darkMarkers: [...DEFAULT_DARK_MARKERS] },
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

export interface RawConfigFile {
  include?: unknown;
  exclude?: unknown;
  categories?: unknown;
  outputFormats?: unknown;
  outputDir?: unknown;
  naming?: { case?: unknown; prefix?: unknown };
  theme?: { darkMarkers?: unknown };
  clustering?: {
    color?: { deltaE?: unknown };
    spacing?: { toleranceRem?: unknown };
    colorDeltaE?: unknown;
    spacingToleranceRem?: unknown;
  };
}

/** One overlay in the editor/project stack. Same shape as `.designtokenrc.json`. */
export type ConfigOverlay = RawConfigFile;

/**
 * Optional editor layers. Applied in this order (later wins):
 * core defaults → user → workspace → `.designtokenrc.json`.
 */
export interface ConfigLayers {
  user?: ConfigOverlay | null;
  workspace?: ConfigOverlay | null;
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

function cloneConfig(config: DesignTokenConfig): DesignTokenConfig {
  return {
    include: [...config.include],
    exclude: [...config.exclude],
    categories: [...config.categories],
    outputFormats: [...config.outputFormats],
    outputDir: config.outputDir,
    naming: { ...config.naming },
    clustering: { ...config.clustering },
    theme: { darkMarkers: [...config.theme.darkMarkers] },
  };
}

function applyOverlay(
  base: DesignTokenConfig,
  raw: RawConfigFile | null | undefined,
  warnings: string[]
): DesignTokenConfig {
  const merged = cloneConfig(base);
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
    if (raw.naming.case !== undefined) {
      const allowed: NamingCase[] = ['kebab', 'camel', 'pascal', 'snake'];
      if (allowed.includes(raw.naming.case as NamingCase)) merged.naming.case = raw.naming.case as NamingCase;
      else warnings.push('Ignored "naming.case": expected kebab, camel, pascal, or snake.');
    }
  }

  if (raw.theme?.darkMarkers !== undefined) {
    const markers = asStringArray(raw.theme.darkMarkers, warnings, 'theme.darkMarkers');
    if (markers && markers.length > 0) merged.theme.darkMarkers = markers;
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

/** Overlay a single raw file (or null) onto core defaults. */
export function mergeConfig(raw: RawConfigFile | null, warnings: string[] = []): DesignTokenConfig {
  return mergeConfigLayers({ rc: raw }, warnings);
}

/**
 * Explicit precedence: `.designtokenrc.json` > VS Code workspace settings >
 * VS Code user settings > core defaults.
 */
export function mergeConfigLayers(
  layers: ConfigLayers & { rc?: ConfigOverlay | null },
  warnings: string[] = []
): DesignTokenConfig {
  let merged = cloneConfig(DEFAULT_DESIGN_TOKEN_CONFIG);
  merged = applyOverlay(merged, layers.user, warnings);
  merged = applyOverlay(merged, layers.workspace, warnings);
  merged = applyOverlay(merged, layers.rc, warnings);
  return merged;
}

export async function loadConfig(
  workspaceRoot: string,
  layers: ConfigLayers = {}
): Promise<LoadedConfig> {
  const source = path.join(workspaceRoot, CONFIG_FILENAME);
  const warnings: string[] = [];
  try {
    const rawText = await fs.readFile(source, 'utf8');
    const parsed = JSON.parse(rawText) as RawConfigFile;
    return { config: mergeConfigLayers({ ...layers, rc: parsed }, warnings), source, warnings };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      return { config: mergeConfigLayers({ ...layers, rc: null }, warnings), source: null, warnings };
    }
    if (err instanceof SyntaxError) {
      warnings.push(`${CONFIG_FILENAME} is not valid JSON; using defaults. ${err.message}`);
      return { config: mergeConfigLayers({ ...layers, rc: null }, warnings), source, warnings };
    }
    throw err;
  }
}
