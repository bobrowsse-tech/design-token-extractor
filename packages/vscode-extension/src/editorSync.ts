import * as path from 'path';
import * as vscode from 'vscode';
import { MigrationWrite, needsEditorSync } from '@design-token-extractor/core';

export { needsEditorSync };

/** Open unsaved editors whose paths Apply is about to write. */
export function findDirtyDocumentsForPaths(absolutePaths: string[]): vscode.TextDocument[] {
  const wanted = new Set(absolutePaths);
  return vscode.workspace.textDocuments.filter(
    (doc) => doc.isDirty && !doc.isUntitled && wanted.has(doc.uri.fsPath)
  );
}

/** Save dirty Apply targets, or cancel so unsaved edits are not overwritten. */
export async function saveDirtyDocumentsOrCancel(docs: vscode.TextDocument[]): Promise<boolean> {
  if (docs.length === 0) return true;
  const names = docs.map((doc) => path.basename(doc.fileName)).join(', ');
  const choice = await vscode.window.showWarningMessage(
    `Design Tokens: ${docs.length} open file(s) have unsaved changes (${names}). Save them before Apply so those edits are included and not overwritten.`,
    'Save and apply',
    'Cancel'
  );
  if (choice !== 'Save and apply') return false;
  const saved = await Promise.all(docs.map((doc) => doc.save()));
  return saved.every(Boolean);
}

/** Replace open editor buffers with Apply results so the user sees var() without a reload. */
export async function syncOpenEditorsWithWrites(writes: MigrationWrite[]): Promise<number> {
  let synced = 0;
  for (const write of writes) {
    const uri = vscode.Uri.file(write.absolutePath);
    const document = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === uri.fsPath);
    if (!document) continue;
    if (document.isDirty) continue;
    if (!needsEditorSync(document.getText(), write.contents)) continue;
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    edit.replace(uri, fullRange, write.contents);
    if (await vscode.workspace.applyEdit(edit)) synced += 1;
  }
  return synced;
}
