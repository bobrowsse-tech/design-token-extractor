import * as vscode from 'vscode';
import { extractFromSource, TokenOccurrence } from '@design-token-extractor/core';

const SUPPORTED_LANGUAGES = new Set([
  'css', 'scss', 'sass', 'less', 'vue', 'html',
  'javascript', 'javascriptreact', 'typescript', 'typescriptreact',
]);

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
  private workspaceCounts = new Map<string, number>();

  refresh(): void {
    this.onDidChangeEmitter.fire();
  }

  setWorkspaceOccurrences(occurrences: TokenOccurrence[]): void {
    this.workspaceCounts.clear();
    for (const occ of occurrences) {
      const key = `${occ.category}::${occ.rawValue.trim().toLowerCase()}`;
      this.workspaceCounts.set(key, (this.workspaceCounts.get(key) ?? 0) + 1);
    }
    this.refresh();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const settings = vscode.workspace.getConfiguration('designTokens');
    const enabled = settings.get<boolean>('codeLens.enabled', true);
    if (!enabled) return [];
    const minOccurrences = settings.get<number>('clustering.minOccurrences', 1);
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
      const first = occs[0];
      const key = `${first.category}::${first.rawValue.trim().toLowerCase()}`;
      const workspaceCount = this.workspaceCounts.get(key) ?? 0;
      const fileCount = occs.length;
      const total = Math.max(fileCount, workspaceCount);
      if (total < Math.max(2, minOccurrences)) continue;
      const othersInFile = Math.max(0, fileCount - 1);
      const othersInWorkspace = Math.max(0, workspaceCount - 1);
      const title = workspaceCount > fileCount
        ? `${othersInWorkspace} other place(s) in this workspace use "${first.rawValue.trim()}" — Replace with token`
        : `${othersInFile} other place(s) in this file use "${first.rawValue.trim()}" — Replace with token`;
      const range = new vscode.Range(first.line - 1, 0, first.line - 1, 0);
      lenses.push(new vscode.CodeLens(range, {
        title,
        command: 'designTokens.replaceInFile',
        arguments: [document.uri, first.rawValue.trim(), first.category],
      }));
    }
    return lenses;
  }
}
