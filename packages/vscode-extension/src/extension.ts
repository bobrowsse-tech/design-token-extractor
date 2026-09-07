import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  scanAndExtract,
  runPipeline,
  computeStableId,
  nameSingleValue,
  rewriteSimpleOccurrences,
  generateCssFile,
  generateCssIndex,
  generateScssFile,
  generateDtcgJson,
  generateTokensStudioJson,
  generateStylelintConfig,
  generateDesignSystemReadme,
  DEFAULT_CONFIG,
  CATEGORY_ORDER,
  TokenCategory,
  TokensLockFile,
} from '@design-tokens/core';
import { DesignTokenCodeLensProvider } from './codeLensProvider';

const OUTPUT_CHANNEL_NAME = 'Design Tokens';
const TOKENS_DIR = 'design-tokens';

function firstWorkspaceRoot(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
}

async function readLockFile(root: string): Promise<TokensLockFile | null> {
  try {
    const raw = await fs.readFile(path.join(root, TOKENS_DIR, 'tokens.lock.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  const codeLensProvider = new DesignTokenCodeLensProvider();

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [{ language: 'css' }, { language: 'scss' }, { language: 'sass' }, { language: 'less' }],
      codeLensProvider
    )
  );

  // --- Phase 1: scan only, writes the read-only report, never touches source ---
  const scanCommand = vscode.commands.registerCommand('designTokens.scanWorkspace', async () => {
    const root = firstWorkspaceRoot();
    if (!root) {
      vscode.window.showErrorMessage('Design Tokens: open a folder/workspace first.');
      return;
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Design Tokens: scanning workspace…', cancellable: false },
      async () => {
        // TODO Phase 1.1: load .designtokenrc.json from root and merge over DEFAULT_CONFIG.
        const { report } = await scanAndExtract(root, DEFAULT_CONFIG);

        const reportPath = path.join(root, '.designtokens-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

        output.clear();
        output.appendLine(`Scanned ${report.filesScanned} files, found ${report.occurrenceCount} occurrences.`);
        for (const [category, stats] of Object.entries(report.summaryByCategory)) {
          output.appendLine(`  ${category}: ${stats.totalOccurrences} occurrences, ${stats.uniqueValues} unique values`);
        }
        output.show(true);

        const doc = await vscode.workspace.openTextDocument(reportPath);
        await vscode.window.showTextDocument(doc, { preview: false });

        vscode.window.showInformationMessage(
          `Design Tokens: found ${report.occurrenceCount} occurrences across ${report.filesScanned} files.`
        );
      }
    );
  });

  // --- Phase 2: full pipeline, writes token files + lockfile + stylelint
  // config + README. Still never touches the user's own CSS/SCSS files —
  // that's still Phase 4, not implemented here. ---
  const generateCommand = vscode.commands.registerCommand('designTokens.generateTokenFiles', async () => {
    const root = firstWorkspaceRoot();
    if (!root) {
      vscode.window.showErrorMessage('Design Tokens: open a folder/workspace first.');
      return;
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Design Tokens: generating token files…', cancellable: false },
      async () => {
        const existingLock = await readLockFile(root);
        const result = await runPipeline(root, { existingLock });

        const outDir = path.join(root, TOKENS_DIR);
        await fs.mkdir(outDir, { recursive: true });
        const categoriesPresent = [...new Set(result.tokens.map((t) => t.category))];

        for (const category of CATEGORY_ORDER) {
          const css = generateCssFile(result.tokens, category);
          if (css) await fs.writeFile(path.join(outDir, `${category}.css`), css);
          const scssContent = generateScssFile(result.tokens, category);
          if (scssContent) await fs.writeFile(path.join(outDir, `_${category}.scss`), scssContent);
        }
        await fs.writeFile(path.join(outDir, 'index.css'), generateCssIndex(categoriesPresent));
        await fs.writeFile(path.join(outDir, 'tokens.dtcg.json'), generateDtcgJson(result.tokens));
        await fs.writeFile(path.join(outDir, 'tokens.tokensstudio.json'), generateTokensStudioJson(result.tokens));
        await fs.writeFile(path.join(outDir, 'tokens.lock.json'), JSON.stringify(result.lockFile, null, 2));
        await fs.writeFile(path.join(root, '.stylelintrc.json'), generateStylelintConfig(new Set(categoriesPresent)));
        await fs.writeFile(
          path.join(outDir, 'README.md'),
          generateDesignSystemReadme(result.tokens, result.contrastFindings, result.themePairs)
        );

        output.clear();
        output.appendLine(`Generated ${result.tokens.length} tokens in ${outDir}/`);
        output.appendLine(`  lockfile: unchanged ${result.lockDiff.unchanged}, added ${result.lockDiff.added.length}, removed ${result.lockDiff.removed.length}`);
        if (result.themePairs.length) output.appendLine(`  ${result.themePairs.length} light/dark pair(s) detected — see README.md`);
        const failingContrast = result.contrastFindings.filter((f) => !f.passesAA);
        if (failingContrast.length) output.appendLine(`  ${failingContrast.length} color pair(s) fail WCAG AA — see README.md`);
        output.show(true);

        vscode.window.showInformationMessage(`Design Tokens: generated ${result.tokens.length} tokens in ${TOKENS_DIR}/`);
      }
    );
  });

  // --- CodeLens-driven safe in-file replace. Scoped to the current file
  // only, and only rewrites unambiguous (non-shorthand) declarations — see
  // rewriter/simpleValueRewriter.ts for exactly what "safe" means here. ---
  const replaceInFileCommand = vscode.commands.registerCommand(
    'designTokens.replaceInFile',
    async (uri: vscode.Uri, rawValue: string, category: TokenCategory) => {
      const root = firstWorkspaceRoot();
      const lock = root ? await readLockFile(root) : null;
      const lockedEntry = lock?.entries.find((e) => e.id === computeStableId(category, rawValue));
      const tokenName = lockedEntry?.name ?? nameSingleValue(category, rawValue);

      if (!lockedEntry) {
        const proceed = await vscode.window.showWarningMessage(
          `No committed token exists yet for "${rawValue}" — this would use a provisional name (--${tokenName}) that isn't in tokens.lock.json. Run "Design Tokens: Generate Token Files" first for a stable name across the whole workspace, or continue with this file-only provisional name?`,
          'Continue with provisional name',
          'Cancel'
        );
        if (proceed !== 'Continue with provisional name') return;
      }

      const document = await vscode.workspace.openTextDocument(uri);
      const varStyle = document.languageId === 'scss' || document.languageId === 'sass' ? 'scss' : 'css';
      const result = rewriteSimpleOccurrences(uri.fsPath, document.getText(), {
        targetRawValue: rawValue,
        tokenName,
        varStyle,
      });

      if (result.replacedCount === 0) {
        vscode.window.showInformationMessage('Design Tokens: nothing safe to replace (all matches are inside shorthand values).');
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
      edit.replace(uri, fullRange, result.newContents);
      await vscode.workspace.applyEdit(edit);

      let message = `Design Tokens: replaced ${result.replacedCount} occurrence(s) with --${tokenName}.`;
      if (result.skippedShorthandCount > 0) {
        message += ` ${result.skippedShorthandCount} more match inside shorthand values (box-shadow, etc.) and were left alone — not yet safe to auto-rewrite.`;
      }
      vscode.window.showInformationMessage(message);
      codeLensProvider.refresh();
    }
  );

  context.subscriptions.push(scanCommand, generateCommand, replaceInFileCommand, output);
}

export function deactivate() {}
