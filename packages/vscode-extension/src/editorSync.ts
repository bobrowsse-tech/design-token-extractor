import * as vscode from 'vscode';
import { MigrationWrite, needsEditorSync } from '@design-token-extractor/core';

export { needsEditorSync };

/** Replace open editor buffers with Apply results so the user sees var() without a reload. */
export async function syncOpenEditorsWithWrites(writes: MigrationWrite[]): Promise<number> {
  let synced = 0;
  for (const write of writes) {
    const uri = vscode.Uri.file(write.absolutePath);
    const document = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === uri.fsPath);
    if (!document) continue;
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
