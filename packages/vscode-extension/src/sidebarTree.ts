import * as vscode from 'vscode';

interface SidebarCommand {
  label: string;
  command: string;
  icon: string;
}

const COMMANDS: SidebarCommand[] = [
  { label: 'Scan Workspace', command: 'designTokens.scanWorkspace', icon: 'search' },
  { label: 'Generate Token Files', command: 'designTokens.generateTokenFiles', icon: 'symbol-color' },
  { label: 'Review Clusters', command: 'designTokens.reviewClusters', icon: 'eye' },
  { label: 'Preview Migration', command: 'designTokens.previewMigration', icon: 'diff' },
  { label: 'Undo Last Migration', command: 'designTokens.undoMigration', icon: 'discard' },
  { label: 'Undo From History', command: 'designTokens.undoHistory', icon: 'history' },
  { label: 'Rename Token', command: 'designTokens.renameToken', icon: 'edit' },
  { label: 'Map Semantic Alias', command: 'designTokens.mapSemantics', icon: 'link' },
];

export class DesignTokensSidebarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    return COMMANDS.map((entry) => {
      const item = new vscode.TreeItem(entry.label, vscode.TreeItemCollapsibleState.None);
      item.command = { command: entry.command, title: entry.label };
      item.iconPath = new vscode.ThemeIcon(entry.icon);
      item.contextValue = entry.command;
      return item;
    });
  }
}
