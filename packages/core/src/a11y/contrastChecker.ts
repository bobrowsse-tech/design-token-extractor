import { TokenOccurrence, ContrastFinding } from '../types';
import { parseColor, contrastRatio } from '../color/colorMath';

const FG_PROPS = new Set(['color']);
const BG_PROPS = new Set(['background-color', 'background']);

/**
 * Pairs up foreground/background colors declared on the SAME selector (a
 * reasonable heuristic — doesn't catch colors inherited across selectors,
 * that would need full cascade resolution, out of scope here) and checks
 * WCAG 2.x contrast. This falls out almost for free once color extraction
 * and parsing already exist.
 */
export function checkContrast(occurrences: TokenOccurrence[]): ContrastFinding[] {
  const bySelector = new Map<string, TokenOccurrence[]>();
  for (const occ of occurrences) {
    if (occ.category !== 'color') continue;
    const list = bySelector.get(`${occ.file}::${occ.selector}`) ?? [];
    list.push(occ);
    bySelector.set(`${occ.file}::${occ.selector}`, list);
  }

  const findings: ContrastFinding[] = [];
  for (const occs of bySelector.values()) {
    const fg = occs.find((o) => FG_PROPS.has(o.property));
    const bg = occs.find((o) => BG_PROPS.has(o.property));
    if (!fg || !bg) continue;

    const fgColor = parseColor(fg.rawValue);
    const bgColor = parseColor(bg.rawValue);
    if (!fgColor || !bgColor) continue;
    if (fgColor.a < 1 || bgColor.a < 1) continue; // needs compositing, out of scope for now

    const ratio = contrastRatio(fgColor, bgColor);
    findings.push({
      selector: fg.selector,
      file: fg.file,
      line: fg.line,
      foreground: fg.rawValue.trim(),
      background: bg.rawValue.trim(),
      ratio: Math.round(ratio * 100) / 100,
      passesAA: ratio >= 4.5,
      passesAAA: ratio >= 7,
    });
  }
  return findings;
}
