import * as vscode from 'vscode';
import { MigrationItem, MigrationPlan } from '@design-tokens/core';

export class MigrationPreviewPanel {
  static current: MigrationPreviewPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private plan: MigrationPlan;
  private onApply: (plan: MigrationPlan) => Promise<void>;

  static show(context: vscode.ExtensionContext, plan: MigrationPlan, onApply: (plan: MigrationPlan) => Promise<void>): MigrationPreviewPanel {
    if (MigrationPreviewPanel.current) {
      MigrationPreviewPanel.current.plan = plan;
      MigrationPreviewPanel.current.onApply = onApply;
      MigrationPreviewPanel.current.panel.reveal();
      MigrationPreviewPanel.current.render();
      return MigrationPreviewPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      'designTokens.preview',
      'Design Tokens: Preview Migration',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    const instance = new MigrationPreviewPanel(panel, plan, onApply);
    MigrationPreviewPanel.current = instance;
    context.subscriptions.push(panel);
    return instance;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    plan: MigrationPlan,
    onApply: (plan: MigrationPlan) => Promise<void>
  ) {
    this.panel = panel;
    this.plan = plan;
    this.onApply = onApply;
    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'toggle' && typeof message.id === 'string') {
        const item = this.plan.items.find((entry) => entry.id === message.id);
        if (item && item.safe) item.accepted = Boolean(message.accepted);
        this.render();
      }
      if (message.type === 'bulk' && (message.scope === 'safe' || message.scope === 'all')) {
        const accepted = Boolean(message.accepted);
        for (const item of this.plan.items) {
          if (item.safe) item.accepted = accepted;
        }
        this.render();
      }
      if (message.type === 'apply') {
        await this.onApply(this.plan);
      }
    });
    this.panel.onDidDispose(() => {
      if (MigrationPreviewPanel.current === this) MigrationPreviewPanel.current = undefined;
    });
    this.render();
  }

  getPlan(): MigrationPlan {
    return this.plan;
  }

  private render(): void {
    const nonce = String(Date.now());
    const safe = this.plan.items.filter((i) => i.safe);
    const accepted = safe.filter((i) => i.accepted);
    const flagged = this.plan.items.filter((i) => !i.safe);
    const byFile = new Map<string, MigrationItem[]>();
    for (const item of this.plan.items) {
      const list = byFile.get(item.file) ?? [];
      list.push(item);
      byFile.set(item.file, list);
    }

    const filesHtml = [...byFile.entries()].map(([file, items]) => {
      const rows = items.map((item) => {
        const disabled = item.safe ? '' : 'disabled';
        const checked = item.accepted && item.safe ? 'checked' : '';
        const flag = item.skipReason ? `<span class="flag">${escapeHtml(item.skipReason)}</span>` : '';
        return `<tr>
          <td><input type="checkbox" data-id="${escapeHtml(item.id)}" ${checked} ${disabled} /></td>
          <td class="mono">${item.line}:${item.column}</td>
          <td>${escapeHtml(item.property)}</td>
          <td class="mono">${escapeHtml(item.rawValue)}</td>
          <td class="mono">${item.safe ? escapeHtml(item.replacement) : '—'}</td>
          <td>${flag}</td>
        </tr>`;
      }).join('');
      return `<section>
        <h2>${escapeHtml(file)}</h2>
        <table>
          <thead><tr><th></th><th>Loc</th><th>Property</th><th>Literal</th><th>Token</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
    }).join('');

    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    :root { color-scheme: light dark; }
    body { font-family: var(--vscode-font-family); padding: 16px 20px 40px; }
    h1 { font-size: 16px; margin: 0 0 8px; }
    p, td, th { font-size: 12px; }
    .bar { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0 20px; }
    button { font: inherit; padding: 4px 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--vscode-editorWidget-border, #444); vertical-align: top; }
    .mono { font-family: var(--vscode-editor-font-family, monospace); }
    .flag { opacity: 0.75; }
    h2 { font-size: 13px; margin: 18px 0 8px; }
  </style>
</head>
<body>
  <h1>Preview migration</h1>
  <p>${accepted.length} of ${safe.length} safe replacements selected. ${flagged.length} flagged for manual review (shorthand, calc(), custom properties, vendor prefixes, or breakpoints) and will not be written.</p>
  <div class="bar">
    <button id="accept-safe">Accept all safe</button>
    <button id="reject-safe">Reject all safe</button>
    <button id="apply">Apply accepted</button>
  </div>
  ${filesHtml || '<p>No hardcoded values found for the current config.</p>'}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('input[type="checkbox"]').forEach((box) => {
      box.addEventListener('change', () => {
        vscode.postMessage({ type: 'toggle', id: box.getAttribute('data-id'), accepted: box.checked });
      });
    });
    document.getElementById('accept-safe').addEventListener('click', () => {
      vscode.postMessage({ type: 'bulk', scope: 'safe', accepted: true });
    });
    document.getElementById('reject-safe').addEventListener('click', () => {
      vscode.postMessage({ type: 'bulk', scope: 'safe', accepted: false });
    });
    document.getElementById('apply').addEventListener('click', () => {
      vscode.postMessage({ type: 'apply' });
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
