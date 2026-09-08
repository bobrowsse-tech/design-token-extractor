import * as vscode from 'vscode';
import {
  applyDecisionsToLockFile,
  applyReviewMessage,
  buildReviewCards,
  parseReviewMessage,
  reconcileWithLockFile,
  NamedToken,
  ReviewCard,
  ReviewDecisions,
  TokenCluster,
  TokensLockFile,
} from '@design-token-extractor/core';

export interface ReviewPanelState {
  decisions: ReviewDecisions;
  lock: TokensLockFile;
  tokens: NamedToken[];
  freshClusters: TokenCluster[];
  freshTokens: NamedToken[];
}

export class ClusterReviewPanel {
  static current: ClusterReviewPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private state: ReviewPanelState;
  private persist: (state: ReviewPanelState) => Promise<void>;

  static show(
    context: vscode.ExtensionContext,
    state: ReviewPanelState,
    persist: (state: ReviewPanelState) => Promise<void>
  ): ClusterReviewPanel {
    if (ClusterReviewPanel.current) {
      ClusterReviewPanel.current.state = state;
      ClusterReviewPanel.current.persist = persist;
      ClusterReviewPanel.current.panel.reveal();
      ClusterReviewPanel.current.render();
      return ClusterReviewPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      'designTokens.reviewClusters',
      'Design Tokens: Review Clusters',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    const instance = new ClusterReviewPanel(panel, state, persist);
    ClusterReviewPanel.current = instance;
    context.subscriptions.push(panel);
    return instance;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    state: ReviewPanelState,
    persist: (state: ReviewPanelState) => Promise<void>
  ) {
    this.panel = panel;
    this.state = state;
    this.persist = persist;
    this.panel.webview.onDidReceiveMessage(async (raw: unknown) => {
      await this.handleMessage(raw);
    });
    this.panel.onDidDispose(() => {
      if (ClusterReviewPanel.current === this) ClusterReviewPanel.current = undefined;
    });
    this.render();
  }

  private async handleMessage(raw: unknown): Promise<void> {
    const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
    const messages = [];
    if (record?.type === 'merge-group' && typeof record.targetId === 'string' && Array.isArray(record.clusterIds)) {
      for (const sourceId of record.clusterIds) {
        if (typeof sourceId === 'string' && sourceId !== record.targetId) {
          messages.push({ type: 'merge' as const, sourceId, targetId: record.targetId });
        }
      }
    } else {
      const parsed = parseReviewMessage(raw);
      if (parsed) messages.push(parsed);
    }
    if (messages.length === 0) return;

    try {
      for (const message of messages) {
        this.state.decisions = applyReviewMessage(this.state.decisions, message);
      }
    } catch (err) {
      const error = err as Error;
      vscode.window.showErrorMessage(`Design Tokens: ${error.message}`);
      return;
    }

    this.state.lock = applyDecisionsToLockFile(this.state.lock, this.state.decisions, this.state.freshTokens);
    const reconciled = reconcileWithLockFile(this.state.freshTokens, this.state.lock, this.state.freshClusters);
    this.state.lock = reconciled.mergedLock;
    this.state.tokens = reconciled.resolvedTokens;
    await this.persist(this.state);
    this.render();
  }

  private cards(): ReviewCard[] {
    const reconciled = reconcileWithLockFile(this.state.freshTokens, this.state.lock, this.state.freshClusters);
    return buildReviewCards(reconciled.resolvedClusters, reconciled.resolvedTokens, reconciled.mergedLock);
  }

  private render(): void {
    const nonce = String(Date.now());
    const cards = this.cards();
    const groups = cards.filter((card) => card.kind === 'cluster-group');
    const refs = cards.filter((card) => card.kind === 'reference-name');

    const groupHtml = groups.map((card) => {
      const clusters = card.clusters ?? [];
      const members = clusters.map((cluster, index) => {
        const swatch = cluster.swatch
          ? `<span class="swatch" data-swatch="${escapeHtml(cluster.swatch)}"></span>`
          : '';
        return `<label class="member">
          <input type="radio" name="target-${escapeHtml(card.groupId)}" value="${escapeHtml(cluster.id)}" ${index === 0 ? 'checked' : ''} />
          ${swatch}
          <span>
            <span class="mono">${escapeHtml(cluster.canonicalValue)}</span>
            <span class="meta">${cluster.occurrenceCount} occurrence(s) in ${cluster.fileCount} file(s) · confidence ${cluster.confidence.toFixed(2)}</span>
            <span class="meta">members: ${escapeHtml(cluster.memberValues.join(', '))}</span>
          </span>
        </label>`;
      }).join('');
      return `<section class="card" data-group="${escapeHtml(card.groupId)}">
        <p class="cat">${escapeHtml(clusters[0]?.category ?? 'cluster')}</p>
        <div class="members">${members}</div>
        <div class="bar">
          <button data-action="merge">Merge into one token</button>
          <button data-action="keep-separate">Keep separate</button>
        </div>
      </section>`;
    }).join('');

    const refHtml = refs.map((card) => {
      const token = card.token;
      if (!token) return '';
      const swatch = token.swatch
        ? `<span class="swatch" data-swatch="${escapeHtml(token.swatch)}"></span>`
        : '';
      return `<section class="card" data-rename="${escapeHtml(token.id)}" data-previous="${escapeHtml(token.name)}">
        <p class="cat">${escapeHtml(token.category)}</p>
        <p class="ref">${swatch}<span class="mono">${escapeHtml(token.value)}</span> — ${escapeHtml(token.referenceLabel)}</p>
        <label>Rename <input class="rename" type="text" value="${escapeHtml(token.name)}" /></label>
        <div class="bar">
          <button data-action="rename">Rename</button>
          <button data-action="keep-name">Keep this name</button>
        </div>
      </section>`;
    }).join('');

    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';" />
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body { font-family: var(--vscode-font-family); padding: 16px 20px 40px; }
    h1 { font-size: 16px; margin: 0 0 8px; }
    p, label, button { font-size: 12px; }
    .card { border: 1px solid var(--vscode-editorWidget-border, #444); border-radius: 6px; padding: 12px; margin: 0 0 14px; }
    .cat { text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; margin: 0 0 8px; }
    .members { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
    .member, .ref { display: flex; gap: 8px; align-items: flex-start; }
    .meta { display: block; opacity: 0.75; }
    .mono { font-family: var(--vscode-editor-font-family, monospace); }
    .swatch { width: 18px; height: 18px; border-radius: 4px; border: 1px solid var(--vscode-editorWidget-border, #666); flex: 0 0 18px; }
    .bar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    button, input { font: inherit; }
    input.rename { min-width: 16em; }
  </style>
</head>
<body>
  <h1>Review clusters</h1>
  <p>${groups.length} near-match group(s) and ${refs.length} color-name flag(s) need a decision. Decisions are stored on tokens.lock.json and will not be asked again.</p>
  ${groupHtml || '<p>No fuzzy-match clusters need review.</p>'}
  ${refHtml}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-swatch]').forEach((el) => {
      el.style.backgroundColor = el.getAttribute('data-swatch');
    });
    document.querySelectorAll('[data-group]').forEach((card) => {
      const ids = [...card.querySelectorAll('input[type="radio"]')].map((input) => input.value);
      card.querySelector('[data-action="merge"]').addEventListener('click', () => {
        const target = card.querySelector('input[type="radio"]:checked');
        vscode.postMessage({ type: 'merge-group', targetId: target && target.value, clusterIds: ids });
      });
      card.querySelector('[data-action="keep-separate"]').addEventListener('click', () => {
        vscode.postMessage({ type: 'keep-separate', clusterIds: ids });
      });
    });
    document.querySelectorAll('[data-rename]').forEach((card) => {
      const id = card.getAttribute('data-rename');
      const previousName = card.getAttribute('data-previous');
      const input = card.querySelector('.rename');
      card.querySelector('[data-action="rename"]').addEventListener('click', () => {
        vscode.postMessage({ type: 'rename', id, name: input.value, previousName });
      });
      card.querySelector('[data-action="keep-name"]').addEventListener('click', () => {
        vscode.postMessage({ type: 'rename', id, name: previousName, previousName });
      });
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
