import { NamedToken, ContrastFinding, ThemePair, ProbableTypo } from '../types';

function table(headers: string[], rows: string[][]): string {
  const headerLine = `| ${headers.join(' | ')} |`;
  const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const rowLines = rows.map((r) => `| ${r.join(' | ')} |`);
  return [headerLine, sepLine, ...rowLines].join('\n');
}

export function generateDesignSystemReadme(
  tokens: NamedToken[],
  contrastFindings: ContrastFinding[],
  themePairs: ThemePair[],
  probableTypos: ProbableTypo[] = []
): string {
  const sections: string[] = ['# Design Tokens', '', `_Generated ${new Date().toISOString()}. Do not hand-edit — re-run the scan instead._`, ''];

  const colors = tokens.filter((t) => t.category === 'color').sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  if (colors.length) {
    sections.push('## Color', '');
    sections.push(table(
      ['Token', 'Value', 'Used', 'Reference'],
      colors.map((t) => {
        const match = t.referenceMatch;
        const reference = match
          ? `${match.source === 'tailwind' ? 'Tailwind' : 'CSS'} \`${match.name}\` (ΔE ${match.deltaE})`
          : '—';
        return [`\`--${t.name}\``, t.value, `${t.occurrenceCount}x / ${t.fileCount} files`, reference];
      })
    ));
    sections.push('');
  }

  const spacing = tokens.filter((t) => t.category === 'spacing').sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  if (spacing.length) {
    sections.push('## Spacing', '');
    sections.push(table(['Token', 'Value', 'Used'], spacing.map((t) => [`\`--${t.name}\``, t.value, `${t.occurrenceCount}x`])));
    sections.push('');
  }

  const typography = tokens.filter((t) => ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing'].includes(t.category));
  if (typography.length) {
    sections.push('## Typography', '');
    sections.push(table(['Token', 'Value', 'Category'], typography.map((t) => [`\`--${t.name}\``, t.value, t.category])));
    sections.push('');
  }

  if (probableTypos.length) {
    sections.push('## Probable typos', '', '_Report only — these are not merged. A rare value close to a common or standard one is usually drift, not a second token._', '');
    sections.push(table(
      ['Category', 'Suspect', 'Likely intended', 'Why'],
      probableTypos.map((t) => [
        t.category,
        `\`${t.suspectValue}\` (${t.suspectCount}x)`,
        `\`${t.likelyIntended}\` (${t.likelyIntendedCount}x)`,
        t.reason,
      ])
    ));
    sections.push('');
  }

  if (themePairs.length) {
    sections.push('## Detected light/dark pairs', '', '_Suggestion only — confirm before turning these into a single themeable token. `low` confidence means more than one candidate matched after theme-marker stripping._', '');
    sections.push(table(
      ['Property', 'Selector', 'Light', 'Dark', 'Confidence'],
      themePairs.map((p) => [p.property, p.baseSelector, p.lightValue, p.darkValue, `${p.confidence} (${p.candidateCount})`])
    ));
    sections.push('');
  }

  if (contrastFindings.length) {
    const failing = contrastFindings.filter((f) => !f.passesAA);
    const sameSelector = contrastFindings.filter((f) => f.pairing === 'same-selector').length;
    const ancestor = contrastFindings.filter((f) => f.pairing === 'ancestor').length;
    sections.push('## Accessibility: WCAG contrast', '');
    sections.push(`${contrastFindings.length} foreground/background pair(s) checked (${sameSelector} same-selector, ${ancestor} ancestor heuristic), ${failing.length} fail AA (4.5:1).`, '');
    sections.push('_Limitation: this is not full cascade resolution. Inherited color from a distant ancestor, or backgrounds set only in HTML, are still invisible to this check._', '');
    if (failing.length) {
      sections.push(table(
        ['File', 'Selector', 'Foreground', 'Background', 'Ratio', 'Pairing'],
        failing.map((f) => [f.file, f.selector, f.foreground, f.background, `${f.ratio}:1`, f.pairing])
      ));
      sections.push('');
    }
  }

  return sections.join('\n');
}
