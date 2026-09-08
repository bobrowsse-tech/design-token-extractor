import { TokenOccurrence, ContrastFinding } from '../types';
import { parseColor, contrastRatio, flattenForContrast } from '../color/colorMath';

const FG_PROPS = new Set(['color']);
const BG_PROPS = new Set(['background-color', 'background']);
const DOCUMENT_SELECTORS = new Set(['html', 'body', ':root', '(root)']);

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
  const flat = flattenForContrast(fgColor, bgColor);
  const ratio = contrastRatio(flat.fg, flat.bg);
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

  const documentBgs = colorOccs.filter((o) => (
    BG_PROPS.has(o.property) && DOCUMENT_SELECTORS.has(o.selector.trim().toLowerCase())
  ));

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
    let paired = false;
    for (const bg of bgs) {
      if (bg.file !== fg.file) continue;
      if (!isPlausibleAncestorSelector(bg.selector, fg.selector)) continue;
      push(findingFromPair(fg, bg, 'ancestor'));
      paired = true;
    }
    if (!paired) {
      for (const bg of documentBgs) {
        if (bg.file !== fg.file) continue;
        push(findingFromPair(fg, bg, 'document'));
      }
    }
  }

  for (const occs of bySelector.values()) {
    const bg = occs.find((o) => BG_PROPS.has(o.property));
    const ownFg = occs.some((o) => FG_PROPS.has(o.property));
    if (!bg || ownFg) continue;
    for (const fg of fgs) {
      if (fg.file !== bg.file) continue;
      if (isPlausibleAncestorSelector(fg.selector, bg.selector)) {
        push(findingFromPair(fg, bg, 'inherited'));
      }
    }
  }

  return findings;
}
