import { TokenOccurrence, ContrastFinding } from '../types';
import { parseColor, contrastRatio } from '../color/colorMath';

const FG_PROPS = new Set(['color']);
const BG_PROPS = new Set(['background-color', 'background']);

/**
 * Same-selector pairing is the reliable case. Most real contrast issues are
 * cascade: background on `.card`, color on `.card__title`. We add a conservative
 * ancestor heuristic (BEM prefix / descendant combinator) for that, and still
 * document that full cascade resolution is out of scope.
 */
export function isPlausibleAncestorSelector(parentSel: string, childSel: string): boolean {
  const parent = parentSel.trim();
  const child = childSel.trim();
  if (!parent || !child || parent === child) return false;
  if (child.startsWith(`${parent} `) || child.startsWith(`${parent}>`) || child.startsWith(`${parent} >`)) {
    return true;
  }
  if (child.startsWith(`${parent}__`) || child.startsWith(`${parent}--`)) return true;
  return false;
}

function findingFromPair(
  fg: TokenOccurrence,
  bg: TokenOccurrence,
  pairing: ContrastFinding['pairing']
): ContrastFinding | null {
  const fgColor = parseColor(fg.rawValue);
  const bgColor = parseColor(bg.rawValue);
  if (!fgColor || !bgColor) return null;
  if (fgColor.a < 1 || bgColor.a < 1) return null;
  const ratio = contrastRatio(fgColor, bgColor);
  return {
    selector: fg.selector,
    file: fg.file,
    line: fg.line,
    foreground: fg.rawValue.trim(),
    background: bg.rawValue.trim(),
    ratio: Math.round(ratio * 100) / 100,
    passesAA: ratio >= 4.5,
    passesAAA: ratio >= 7,
    pairing,
  };
}

export function checkContrast(occurrences: TokenOccurrence[]): ContrastFinding[] {
  const colorOccs = occurrences.filter((occ) => occ.category === 'color');
  const bySelector = new Map<string, TokenOccurrence[]>();
  for (const occ of colorOccs) {
    const list = bySelector.get(`${occ.file}::${occ.selector}`) ?? [];
    list.push(occ);
    bySelector.set(`${occ.file}::${occ.selector}`, list);
  }

  const findings: ContrastFinding[] = [];
  const seen = new Set<string>();
  const push = (finding: ContrastFinding | null) => {
    if (!finding) return;
    const key = `${finding.file}::${finding.selector}::${finding.foreground}::${finding.background}::${finding.pairing}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding);
  };

  for (const occs of bySelector.values()) {
    const fg = occs.find((o) => FG_PROPS.has(o.property));
    const bg = occs.find((o) => BG_PROPS.has(o.property));
    if (fg && bg) push(findingFromPair(fg, bg, 'same-selector'));
  }

  const fgs = colorOccs.filter((o) => FG_PROPS.has(o.property));
  const bgs = colorOccs.filter((o) => BG_PROPS.has(o.property));
  for (const fg of fgs) {
    const sameSelectorBg = colorOccs.some((o) => (
      o.file === fg.file && o.selector === fg.selector && BG_PROPS.has(o.property)
    ));
    if (sameSelectorBg) continue;
    for (const bg of bgs) {
      if (bg.file !== fg.file) continue;
      if (!isPlausibleAncestorSelector(bg.selector, fg.selector)) continue;
      push(findingFromPair(fg, bg, 'ancestor'));
    }
  }

  return findings;
}
