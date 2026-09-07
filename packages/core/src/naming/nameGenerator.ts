import { TokenCluster, NamedToken, TokenCategory } from '../types';
import { parseColor, toHsl } from '../color/colorMath';

export interface NamingOptions {
  case: 'kebab'; // only kebab-case implemented for now; config stub for Phase 5
  prefix: string;
}

export const DEFAULT_NAMING_OPTIONS: NamingOptions = { case: 'kebab', prefix: '' };

const HUE_NAMES: Array<{ max: number; name: string }> = [
  { max: 15, name: 'red' },
  { max: 45, name: 'orange' },
  { max: 70, name: 'yellow' },
  { max: 160, name: 'green' },
  { max: 190, name: 'teal' },
  { max: 250, name: 'blue' },
  { max: 290, name: 'purple' },
  { max: 345, name: 'pink' },
  { max: 360, name: 'red' },
];

function hueName(h: number): string {
  return HUE_NAMES.find((b) => h <= b.max)?.name ?? 'red';
}

/** Maps 0-100 lightness onto a Tailwind-like 50-950 scale. Higher lightness
 * -> lower number (closer to white), matching common design-token convention. */
function lightnessStep(l: number): number {
  if (l > 95) return 50;
  if (l > 90) return 100;
  if (l > 80) return 200;
  if (l > 70) return 300;
  if (l > 60) return 400;
  if (l > 50) return 500;
  if (l > 40) return 600;
  if (l > 30) return 700;
  if (l > 20) return 800;
  if (l > 10) return 900;
  return 950;
}

function nameColor(canonicalValue: string): string {
  const rgb = parseColor(canonicalValue);
  if (!rgb) return 'color-unknown';
  const { h, s, l } = toHsl(rgb);
  const base = s < 8 ? 'gray' : hueName(h);
  return `color-${base}-${lightnessStep(l)}`;
}

function pxFromValue(value: string): number | null {
  const m = value.trim().match(/^(-?\d*\.?\d+)(px|rem|em)$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  return m[2] === 'px' ? num : num * 16;
}

function slug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function nameForCategory(category: TokenCategory, canonicalValue: string): string {
  switch (category) {
    case 'color':
      return nameColor(canonicalValue);
    case 'spacing': {
      const px = pxFromValue(canonicalValue);
      return px !== null ? `space-${px}` : `space-${slug(canonicalValue)}`;
    }
    case 'radius': {
      const px = pxFromValue(canonicalValue);
      return px !== null ? `radius-${px}` : `radius-${slug(canonicalValue)}`;
    }
    case 'font-size': {
      const px = pxFromValue(canonicalValue);
      return px !== null ? `font-size-${px}` : `font-size-${slug(canonicalValue)}`;
    }
    case 'letter-spacing': {
      const px = pxFromValue(canonicalValue);
      return px !== null ? `letter-spacing-${px}` : `letter-spacing-${slug(canonicalValue)}`;
    }
    case 'line-height':
      return `line-height-${slug(canonicalValue)}`;
    case 'font-weight':
      return `font-weight-${slug(canonicalValue)}`;
    case 'font-family':
      return `font-family-${slug(canonicalValue.split(',')[0])}`;
    case 'shadow': {
      const px = pxFromValue(canonicalValue);
      return px !== null ? `shadow-${px}` : `shadow-${slug(canonicalValue)}`;
    }
    case 'z-index':
      return `z-index-${slug(canonicalValue)}`;
    case 'breakpoint': {
      const px = pxFromValue(canonicalValue);
      return px !== null ? `breakpoint-${px}` : `breakpoint-${slug(canonicalValue)}`;
    }
    case 'transition': {
      if (/\d(ms|s)$/.test(canonicalValue.trim())) return `duration-${slug(canonicalValue)}`;
      return `easing-${slug(canonicalValue)}`;
    }
    default:
      return `token-${slug(canonicalValue)}`;
  }
}

/** Names a single value directly, without a full cluster — used by the
 * CodeLens "replace in file" action for a value that hasn't been through a
 * full workspace scan yet. Prefer looking it up in tokens.lock.json first
 * (see the vscode-extension's replaceInFile command); this is the fallback
 * when no lock entry exists yet. */
export function nameSingleValue(category: TokenCategory, value: string, prefix = ''): string {
  const base = nameForCategory(category, value);
  return prefix ? `${prefix}-${base}` : base;
}

/**
 * Names every cluster. Two clusters of the same category that produce the
 * same primitive name (e.g. two colors that both round to `color-blue-500`)
 * get a numeric suffix — this is a visible signal that the clustering
 * threshold may need tightening, not silently overwritten.
 */
export function nameClusters(
  clusters: TokenCluster[],
  options: NamingOptions = DEFAULT_NAMING_OPTIONS
): NamedToken[] {
  const seenNames = new Map<string, number>();
  const named: NamedToken[] = [];

  // Order by frequency descending so the most-used value in a collision
  // keeps the "clean" name and outliers get the numeric suffix.
  const sorted = [...clusters].sort((a, b) => b.occurrences.length - a.occurrences.length);

  for (const cluster of sorted) {
    let base = nameForCategory(cluster.category, cluster.canonicalValue);
    if (options.prefix) base = `${options.prefix}-${base}`;

    const count = seenNames.get(base) ?? 0;
    seenNames.set(base, count + 1);
    const name = count === 0 ? base : `${base}-alt${count + 1}`;

    named.push({
      clusterId: cluster.id,
      name,
      category: cluster.category,
      value: cluster.canonicalValue,
      occurrenceCount: cluster.occurrences.length,
      fileCount: new Set(cluster.occurrences.map((o) => o.file)).size,
    });
  }

  return named;
}
