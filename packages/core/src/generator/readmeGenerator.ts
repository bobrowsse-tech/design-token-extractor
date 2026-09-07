import { NamedToken, ContrastFinding, ThemePair } from '../types';

function table(headers: string[], rows: string[][]): string {
  const headerLine = `| ${headers.join(' | ')} |`;
  const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const rowLines = rows.map((r) => `| ${r.join(' | ')} |`);
  return [headerLine, sepLine, ...rowLines].join('\n');
}

export function generateDesignSystemReadme(
  tokens: NamedToken[],
  contrastFindings: ContrastFinding[],
  themePairs: ThemePair[]
): string {
  const sections: string[] = ['# Design Tokens', '', `_Generated ${new Date().toISOString()}. Do not hand-edit — re-run the scan instead._`, ''];

  const colors = tokens.filter((t) => t.category === 'color').sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  if (colors.length) {
    sections.push('## Color', '');
    sections.push(table(
      ['Token', 'Value', 'Used'],
      colors.map((t) => [`\`--${t.name}\``, t.value, `${t.occurrenceCount}x / ${t.fileCount} files`])
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

  if (themePairs.length) {
    sections.push('## Detected light/dark pairs', '', '_Suggestion only — confirm before turning these into a single themeable token._', '');
    sections.push(table(
      ['Property', 'Selector', 'Light', 'Dark'],
      themePairs.map((p) => [p.property, p.baseSelector, p.lightValue, p.darkValue])
    ));
    sections.push('');
  }

  if (contrastFindings.length) {
    const failing = contrastFindings.filter((f) => !f.passesAA);
    sections.push('## Accessibility: WCAG contrast', '');
    sections.push(`${contrastFindings.length} foreground/background pair(s) checked, ${failing.length} fail AA (4.5:1).`, '');
    if (failing.length) {
      sections.push(table(
        ['File', 'Selector', 'Foreground', 'Background', 'Ratio'],
        failing.map((f) => [f.file, f.selector, f.foreground, f.background, `${f.ratio}:1`])
      ));
      sections.push('');
    }
  }

  return sections.join('\n');
}
