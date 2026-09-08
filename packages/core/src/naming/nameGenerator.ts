import { TokenCluster, NamedToken, TokenCategory, ColorReferenceMatch } from '../types';
import { parseColor, toHsl } from '../color/colorMath';
import { findClosestReferenceColor, tokenNameFromReference } from '../color/referencePalette';
import { parseNumericTokenValue, splitCssNumber } from '../clustering/typoDetection';

export type NamingCase = 'kebab' | 'camel' | 'pascal' | 'snake';

export interface NamingOptions {
  case: NamingCase;
  prefix: string;
}

export const DEFAULT_NAMING_OPTIONS: NamingOptions = { case: 'kebab', prefix: '' };

const GENERIC_SELECTOR = /^(html|body|div|span|p|a|i|b|em|strong|ul|ol|li|section|article|main|header|footer|nav|button|input|img|svg|\*|root|x|\(root\)|\(class\)|\(css-in-js\)|\(inline-style\))$/i;

export function applyNameCase(kebabName: string, nameCase: NamingCase): string {
  if (nameCase === 'kebab') return kebabName;
  const parts = kebabName.split('-').filter(Boolean);
  if (parts.length === 0) return kebabName;
  if (nameCase === 'snake') return parts.join('_');
  const pascal = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  if (nameCase === 'pascal') return pascal;
  return parts[0] + parts.slice(1).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

export function propertyRole(property: string): string | null {
  const prop = property.trim().toLowerCase();
  if (prop === 'background' || prop === 'background-color' || prop === 'bg') return 'background';
  if (prop === 'color' || prop === 'text') return 'text';
  if (prop === 'border-color' || prop === 'outline-color' || prop === 'border') return 'border';
  if (prop === 'fill') return 'fill';
  if (prop === 'stroke') return 'stroke';
  if (prop === 'margin' || prop.startsWith('margin-') || prop === 'm') return 'margin';
  if (prop === 'padding' || prop.startsWith('padding-') || prop === 'p') return 'padding';
  if (prop === 'gap' || prop === 'row-gap' || prop === 'column-gap') return 'gap';
  return null;
}

export function selectorRole(selector: string): string | null {
  const last = selector.trim().split(',')[0]?.trim().split(/\s+/).pop() ?? '';
  const classOrId = last.replace(/^[:]*:+/, '');
  const match = classOrId.match(/^[.#]?([a-zA-Z][\w-]*)/);
  if (!match) return null;
  const raw = match[1].replace(/__/g, '-').replace(/--/g, '-');
  if (GENERIC_SELECTOR.test(raw) || raw.length < 2) return null;
  return slug(raw);
}

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

function nameColor(canonicalValue: string): { name: string; referenceMatch?: ColorReferenceMatch } {
  const rgb = parseColor(canonicalValue);
  if (!rgb) return { name: 'color-unknown' };
  const match = findClosestReferenceColor(rgb);
  if (match?.usedForName) {
    return { name: tokenNameFromReference(match), referenceMatch: match };
  }
  const { h, s, l } = toHsl(rgb);
  const base = s < 8 ? 'gray' : hueName(h);
  return { name: `color-${base}-${lightnessStep(l)}`, referenceMatch: match ?? undefined };
}

function pxFromValue(value: string): number | null {
  const parsed = parseNumericTokenValue(value);
  return parsed?.kind === 'px' ? parsed.amount : null;
}

function isDurationValue(value: string): boolean {
  const parsed = splitCssNumber(value.trim());
  if (!parsed) return false;
  const unit = parsed.rest.toLowerCase();
  return unit === 'ms' || unit === 's';
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
      return nameColor(canonicalValue).name;
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
    case 'shadow':
      return `shadow-${slug(canonicalValue)}`;
    case 'border':
      return `border-${slug(canonicalValue)}`;
    case 'typography':
      return `typography-${slug(canonicalValue)}`;
    case 'opacity':
      return `opacity-${slug(canonicalValue)}`;
    case 'z-index':
      return `z-index-${slug(canonicalValue)}`;
    case 'breakpoint': {
      const px = pxFromValue(canonicalValue);
      return px !== null ? `breakpoint-${px}` : `breakpoint-${slug(canonicalValue)}`;
    }
    case 'transition': {
      if (isDurationValue(canonicalValue)) return `duration-${slug(canonicalValue)}`;
      if (/^(?:ease(?:-in)?(?:-out)?|linear|step-(?:start|end)|cubic-bezier)/i.test(canonicalValue.trim())) {
        return `easing-${slug(canonicalValue)}`;
      }
      return `transition-${slug(canonicalValue)}`;
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
export function nameSingleValue(
  category: TokenCategory,
  value: string,
  prefixOrOptions: string | Partial<NamingOptions> = ''
): string {
  const options: NamingOptions = typeof prefixOrOptions === 'string'
    ? { ...DEFAULT_NAMING_OPTIONS, prefix: prefixOrOptions }
    : { ...DEFAULT_NAMING_OPTIONS, ...prefixOrOptions };
  const base = nameForCategory(category, value);
  const prefixed = options.prefix ? `${options.prefix}-${base}` : base;
  return applyNameCase(prefixed, options.case);
}

export function semanticNameForCluster(cluster: TokenCluster): string | null {
  const roles = new Map<string, number>();
  for (const occ of cluster.occurrences) {
    const prop = propertyRole(occ.property);
    const sel = selectorRole(occ.selector);
    if (!prop || !sel) continue;
    const prefix = cluster.category === 'color' ? 'color' : cluster.category === 'spacing' ? 'space' : cluster.category;
    const name = `${prefix}-${prop}-${sel}`;
    roles.set(name, (roles.get(name) ?? 0) + 1);
  }
  if (roles.size === 0) return null;
  return [...roles.entries()].sort((a, b) => b[1] - a[1])[0][0];
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
    const semantic = semanticNameForCluster(cluster);
    let base = semantic ?? nameForCategory(cluster.category, cluster.canonicalValue);
    if (options.prefix) base = `${options.prefix}-${base}`;

    const count = seenNames.get(base) ?? 0;
    seenNames.set(base, count + 1);
    const rawName = count === 0 ? base : `${base}-alt${count + 1}`;
    const name = applyNameCase(rawName, options.case);

    named.push({
      clusterId: cluster.id,
      name,
      category: cluster.category,
      value: cluster.canonicalValue,
      occurrenceCount: cluster.occurrences.length,
      fileCount: new Set(cluster.occurrences.map((o) => o.file)).size,
      composite: cluster.occurrences.find((o) => o.composite)?.composite,
      referenceMatch: cluster.category === 'color' ? nameColor(cluster.canonicalValue).referenceMatch : undefined,
      semanticName: semantic ?? undefined,
    });
  }

  return named;
}
