import * as vscode from 'vscode';
import { extractFromSource, TokenOccurrence } from '@design-token-extractor/core';

const SUPPORTED_LANGUAGES = new Set(['css', 'scss', 'sass', 'less']);

function looksLikeGeneratedTokenFile(filePath: string): boolean {
  return /(?:^|\/)design-tokens\//.test(filePath.replace(/\\/g, '/'));
}

/**
 * Scoped, file-local nice-to-have: "N other places in this file use this
 * value". Deliberately does NOT scan the whole workspace on every keystroke
 * — that's what "Design Tokens: Scan Workspace" is for. This only reasons
 * about the currently open document, so it stays fast enough to run on
 * every edit.
 */
export class DesignTokenCodeLensProvider implements vscode.CodeLensProvider {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.onDidChangeEmitter.event;

  refresh(): void {
    this.onDidChangeEmitter.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!SUPPORTED_LANGUAGES.has(document.languageId)) return [];

    let occurrences: TokenOccurrence[];
    try {
      occurrences = extractFromSource(document.uri.fsPath, document.uri.fsPath, document.getText());
    } catch {
      return []; // malformed file mid-edit — fail quiet, this runs on every keystroke
    }

    // Group by category+normalized value, restricted to this file only.
    const groups = new Map<string, TokenOccurrence[]>();
    for (const occ of occurrences) {
      const key = `${occ.category}::${occ.rawValue.trim().toLowerCase()}`;
      const list = groups.get(key) ?? [];
      list.push(occ);
      groups.set(key, list);
    }

    const lenses: vscode.CodeLens[] = [];
    if (looksLikeGeneratedTokenFile(document.uri.fsPath)) {
      for (let line = 0; line < document.lineCount; line++) {
        const match = document.lineAt(line).text.match(/--([a-z][a-z0-9-]*)\s*:/i);
        if (!match) continue;
        lenses.push(new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
          title: `Rename --${match[1]}`,
          command: 'designTokens.renameToken',
          arguments: [match[1]],
        }));
      }
    }

    for (const occs of groups.values()) {
      if (occs.length < 2) continue;
      // Anchor the CodeLens on the FIRST occurrence only, not every one —
      // repeating the same lens on every line would be noisy.
      const first = occs[0];
      const range = new vscode.Range(first.line - 1, 0, first.line - 1, 0);
      lenses.push(new vscode.CodeLens(range, {
        title: `${occs.length - 1} other place(s) in this file use "${first.rawValue.trim()}" — Replace with token`,
        command: 'designTokens.replaceInFile',
        arguments: [document.uri, first.rawValue.trim(), first.category],
      }));
    }
    return lenses;
  }
}
