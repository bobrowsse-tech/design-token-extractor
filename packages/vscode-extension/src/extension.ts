import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
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
  loadConfig,
  DesignTokenConfig,
  CATEGORY_ORDER,
  TokenCategory,
  TokensLockFile,
  buildMigrationPlan,
  applyMigrationPlan,
  MigrationPlan,
  snapshotFiles,
  writeBackupBundle,
  restoreBackupBundle,
  renameLockEntry,
  normalizeColorKey,
} from '@design-token-extractor/core';
import { DesignTokenCodeLensProvider } from './codeLensProvider';
import { MigrationPreviewPanel } from './previewPanel';
import { gitFileState, isGitRepo, rollbackWarning } from './rollbackSafety';

const execFileAsync = promisify(execFile);
const OUTPUT_CHANNEL_NAME = 'Design Tokens';
const PLAN_FILENAME = '.designtokens-migration.json';
const LAST_BACKUP_KEY = 'designTokens.lastBackupDir';

function firstWorkspaceRoot(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
}

async function loadWorkspaceConfig(root: string, output: vscode.OutputChannel): Promise<DesignTokenConfig> {
  const loaded = await loadConfig(root);
  if (loaded.source) output.appendLine(`Loaded config from ${loaded.source}`);
  for (const warning of loaded.warnings) output.appendLine(`Config warning: ${warning}`);
  return loaded.config;
}

async function readLockFile(root: string, outputDir: string): Promise<TokensLockFile | null> {
  try {
    const raw = await fs.readFile(path.join(root, outputDir, 'tokens.lock.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writePlan(root: string, plan: MigrationPlan): Promise<void> {
  await fs.writeFile(path.join(root, PLAN_FILENAME), JSON.stringify(plan, null, 2), 'utf8');
}

async function readPlan(root: string): Promise<MigrationPlan | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(root, PLAN_FILENAME), 'utf8')) as MigrationPlan;
  } catch {
    return null;
  }
}

async function tagPreMigration(root: string): Promise<string | null> {
  if (!(await isGitRepo(root))) return null;
  const tag = `design-tokens-pre-migration-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    await execFileAsync('git', ['tag', tag], { cwd: root });
    return tag;
  } catch {
    return null;
  }
}

async function writeGeneratedFiles(
  root: string,
  config: DesignTokenConfig,
  result: Awaited<ReturnType<typeof runPipeline>>
): Promise<string> {
  const outDir = path.join(root, config.outputDir);
  await fs.mkdir(outDir, { recursive: true });
  const categoriesPresent = [...new Set(result.tokens.map((t) => t.category))];
  const formats = new Set(config.outputFormats);

  if (formats.has('css')) {
    const cssCategories: TokenCategory[] = [];
    for (const category of CATEGORY_ORDER) {
      const css = generateCssFile(result.tokens, category);
      if (css) {
        await fs.writeFile(path.join(outDir, `${category}.css`), css);
        cssCategories.push(category);
      }
    }
    await fs.writeFile(path.join(outDir, 'index.css'), generateCssIndex(cssCategories));
  }
  if (formats.has('scss')) {
    for (const category of CATEGORY_ORDER) {
      const scssContent = generateScssFile(result.tokens, category);
      if (scssContent) await fs.writeFile(path.join(outDir, `_${category}.scss`), scssContent);
    }
  }
  if (formats.has('json-dtcg')) {
    await fs.writeFile(path.join(outDir, 'tokens.dtcg.json'), generateDtcgJson(result.tokens));
  }
  if (formats.has('tokens-studio')) {
    await fs.writeFile(path.join(outDir, 'tokens.tokensstudio.json'), generateTokensStudioJson(result.tokens));
  }
  await fs.writeFile(path.join(outDir, 'tokens.lock.json'), JSON.stringify(result.lockFile, null, 2));
  await fs.writeFile(path.join(root, '.stylelintrc.json'), generateStylelintConfig(new Set(categoriesPresent)));
  await fs.writeFile(
    path.join(outDir, 'README.md'),
    generateDesignSystemReadme(result.tokens, result.contrastFindings, result.themePairs, result.probableTypos)
  );
  return outDir;
}

async function restoreBackupIntoEditors(root: string, backupDir: string): Promise<string[]> {
  const restored = await restoreBackupBundle(root, backupDir);
  for (const relativePath of restored) {
    const uri = vscode.Uri.file(path.join(root, relativePath));
    const document = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === uri.fsPath);
    if (!document) continue;
    const contents = await fs.readFile(uri.fsPath, 'utf8');
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
    edit.replace(uri, fullRange, contents);
    await vscode.workspace.applyEdit(edit);
  }
  return restored;
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

  const scanCommand = vscode.commands.registerCommand('designTokens.scanWorkspace', async () => {
    const root = firstWorkspaceRoot();
    if (!root) {
      vscode.window.showErrorMessage('Design Tokens: open a folder/workspace first.');
      return;
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Design Tokens: scanning workspace…', cancellable: false },
      async () => {
        const config = await loadWorkspaceConfig(root, output);
        const { report } = await scanAndExtract(root, config);

        const reportPath = path.join(root, '.designtokens-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

        output.clear();
        output.appendLine(`Scanned ${report.filesScanned} files, found ${report.occurrenceCount} occurrences.`);
        for (const [category, stats] of Object.entries(report.summaryByCategory)) {
          output.appendLine(`  ${category}: ${stats.totalOccurrences} occurrences, ${stats.uniqueValues} unique values`);
        }
        if (report.probableTypos.length) {
          output.appendLine(`  ${report.probableTypos.length} probable typo(s):`);
          for (const typo of report.probableTypos) {
            output.appendLine(`    [${typo.category}] ${typo.suspectValue} (${typo.suspectCount}x) ≈ ${typo.likelyIntended} (${typo.likelyIntendedCount}x)`);
          }
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

  const generateCommand = vscode.commands.registerCommand('designTokens.generateTokenFiles', async () => {
    const root = firstWorkspaceRoot();
    if (!root) {
      vscode.window.showErrorMessage('Design Tokens: open a folder/workspace first.');
      return;
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Design Tokens: generating token files…', cancellable: false },
      async () => {
        const config = await loadWorkspaceConfig(root, output);
        const existingLock = await readLockFile(root, config.outputDir);
        const result = await runPipeline(root, {
          existingLock,
          scanConfig: config,
          clustering: config.clustering,
          naming: config.naming,
        });
        const outDir = await writeGeneratedFiles(root, config, result);

        output.appendLine(`Generated ${result.tokens.length} tokens in ${outDir}/`);
        output.appendLine(`  lockfile: unchanged ${result.lockDiff.unchanged}, added ${result.lockDiff.added.length}, removed ${result.lockDiff.removed.length}`);
        if (result.probableTypos.length) {
          output.appendLine(`  ${result.probableTypos.length} probable typo(s) — see ${config.outputDir}/README.md`);
        }
        output.show(true);
        vscode.window.showInformationMessage(`Design Tokens: generated ${result.tokens.length} tokens in ${config.outputDir}/`);
      }
    );
  });

  const previewCommand = vscode.commands.registerCommand('designTokens.previewMigration', async () => {
    const root = firstWorkspaceRoot();
    if (!root) {
      vscode.window.showErrorMessage('Design Tokens: open a folder/workspace first.');
      return;
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Design Tokens: building migration preview…', cancellable: false },
      async () => {
        const config = await loadWorkspaceConfig(root, output);
        const existingLock = await readLockFile(root, config.outputDir);
        const result = await runPipeline(root, {
          existingLock,
          scanConfig: config,
          clustering: config.clustering,
          naming: config.naming,
        });
        const { occurrences } = await scanAndExtract(root, config);
        const plan = buildMigrationPlan(occurrences, result.tokens, (category, value) => (
          nameSingleValue(category, value, config.naming.prefix)
        ));
        await writePlan(root, plan);
        MigrationPreviewPanel.show(context, plan, async (nextPlan) => {
          await writePlan(root, nextPlan);
          await vscode.commands.executeCommand('designTokens.applyMigration');
        });
      }
    );
  });

  const applyCommand = vscode.commands.registerCommand('designTokens.applyMigration', async () => {
    const root = firstWorkspaceRoot();
    if (!root) {
      vscode.window.showErrorMessage('Design Tokens: open a folder/workspace first.');
      return;
    }

    const plan = MigrationPreviewPanel.current?.getPlan() ?? await readPlan(root);
    if (!plan) {
      vscode.window.showErrorMessage('Design Tokens: run "Preview Migration" first and accept the replacements you want.');
      return;
    }

    const accepted = plan.items.filter((item) => item.accepted && item.safe);
    if (accepted.length === 0) {
      vscode.window.showInformationMessage('Design Tokens: no accepted safe replacements to apply.');
      return;
    }

    const git = await isGitRepo(root);
    if (!git) {
      const proceed = await vscode.window.showWarningMessage(
        'No automatic rollback available — this folder is not a git repo. A local backup will be kept for "Design Tokens: Undo Last Migration".',
        'Apply anyway',
        'Cancel'
      );
      if (proceed !== 'Apply anyway') return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Apply ${accepted.length} accepted replacement(s) in ${new Set(accepted.map((i) => i.file)).size} file(s)?`,
      'Apply',
      'Cancel'
    );
    if (confirm !== 'Apply') return;

    const backups = await snapshotFiles(root, accepted.map((item) => item.file));
    const backupDir = await writeBackupBundle(root, backups);
    await context.workspaceState.update(LAST_BACKUP_KEY, backupDir);
    const tag = await tagPreMigration(root);

    const result = await applyMigrationPlan(root, plan);
    codeLensProvider.refresh();
    output.appendLine(`Applied ${result.replacedCount} replacement(s) in ${result.filesWritten.length} file(s).`);
    if (tag) output.appendLine(`Pre-migration git tag: ${tag}`);
    output.appendLine(`Backup: ${backupDir}`);
    output.show(true);
    vscode.window.showInformationMessage(
      `Design Tokens: applied ${result.replacedCount} replacement(s). Run "Design Tokens: Undo Last Migration" to restore the backup.`
    );
  });

  const undoCommand = vscode.commands.registerCommand('designTokens.undoMigration', async () => {
    const root = firstWorkspaceRoot();
    if (!root) {
      vscode.window.showErrorMessage('Design Tokens: open a folder/workspace first.');
      return;
    }
    const backupDir = context.workspaceState.get<string>(LAST_BACKUP_KEY);
    if (!backupDir) {
      vscode.window.showErrorMessage('Design Tokens: no migration backup found in this workspace.');
      return;
    }
    const restored = await restoreBackupIntoEditors(root, backupDir);
    codeLensProvider.refresh();
    vscode.window.showInformationMessage(`Design Tokens: restored ${restored.length} file(s) from the last migration backup.`);
  });

  const replaceInFileCommand = vscode.commands.registerCommand(
    'designTokens.replaceInFile',
    async (uri: vscode.Uri, rawValue: string, category: TokenCategory) => {
      const root = firstWorkspaceRoot();
      const config = root ? await loadWorkspaceConfig(root, output) : null;
      const lock = root && config ? await readLockFile(root, config.outputDir) : null;
      const lockedEntry = lock?.entries.find((e) => {
        if (e.id === computeStableId(category, rawValue)) return true;
        if (category !== 'color' || e.category !== 'color') return false;
        const wanted = normalizeColorKey(rawValue);
        const locked = normalizeColorKey(e.value);
        return wanted !== null && wanted === locked;
      });
      const tokenName = lockedEntry?.name ?? nameSingleValue(category, rawValue, config?.naming.prefix ?? '');

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

      if (root) {
        const gitState = await gitFileState(root, uri.fsPath);
        const warning = rollbackWarning(gitState, document.isDirty);
        if (warning.needed) {
          const proceed = await vscode.window.showWarningMessage(warning.message, 'Continue', 'Cancel');
          if (proceed !== 'Continue') return;
        }
      } else {
        const proceed = await vscode.window.showWarningMessage(
          'No automatic rollback available — this file is not in a workspace folder. Undo with Ctrl/Cmd+Z while the editor stays open.',
          'Continue',
          'Cancel'
        );
        if (proceed !== 'Continue') return;
      }

      // Snapshot and rewrite from the same buffer, after every dialog, so
      // ranges cannot go stale if the user typed while a warning was open.
      const source = document.getText();
      const result = rewriteSimpleOccurrences(uri.fsPath, source, {
        targetRawValue: rawValue,
        tokenName,
        varStyle,
      });

      if (result.replacedCount === 0) {
        vscode.window.showInformationMessage('Design Tokens: nothing safe to replace (all matches are inside shorthand values).');
        return;
      }

      if (root) {
        const relativePath = path.relative(root, uri.fsPath);
        const backupDir = await writeBackupBundle(root, [{ relativePath, contents: source }]);
        await context.workspaceState.update(LAST_BACKUP_KEY, backupDir);
      }

      const edit = new vscode.WorkspaceEdit();
      for (const replacement of result.replacements) {
        const range = new vscode.Range(
          document.positionAt(replacement.startOffset),
          document.positionAt(replacement.endOffset)
        );
        edit.replace(uri, range, replacement.replacement);
      }
      await vscode.workspace.applyEdit(edit);
      vscode.window.showInformationMessage(
        `Design Tokens: replaced ${result.replacedCount} occurrence(s) with --${tokenName}. Undo with Ctrl/Cmd+Z, or run "Design Tokens: Undo Last Migration".`
      );
      codeLensProvider.refresh();
    }
  );

  const renameCommand = vscode.commands.registerCommand('designTokens.renameToken', async (tokenId?: string) => {
    const root = firstWorkspaceRoot();
    if (!root) {
      vscode.window.showErrorMessage('Design Tokens: open a folder/workspace first.');
      return;
    }
    const config = await loadWorkspaceConfig(root, output);
    const lock = await readLockFile(root, config.outputDir);
    if (!lock || lock.entries.length === 0) {
      vscode.window.showErrorMessage('Design Tokens: generate token files first so tokens.lock.json exists.');
      return;
    }

    let entry = tokenId
      ? lock.entries.find((item) => item.id === tokenId || item.name === tokenId)
      : undefined;
    if (!entry) {
      const picked = await vscode.window.showQuickPick(
        lock.entries.map((item) => ({
          label: `--${item.name}`,
          description: `${item.category}  ${item.value}`,
          item,
        })),
        { placeHolder: 'Token to rename (updates the lockfile; source CSS is not rewritten)' }
      );
      if (!picked) return;
      entry = picked.item;
    }

    const nextName = await vscode.window.showInputBox({
      prompt: `New name for --${entry.name}`,
      value: entry.name,
      validateInput: (value) => (/^[a-z][a-z0-9-]*$/.test(value.replace(/^--+/, '').trim())
        ? undefined
        : 'Use kebab-case starting with a letter'),
    });
    if (!nextName) return;

    const updatedLock = renameLockEntry(lock, entry.id, nextName);
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Design Tokens: renaming token…', cancellable: false },
      async () => {
        const result = await runPipeline(root, {
          existingLock: updatedLock,
          scanConfig: config,
          clustering: config.clustering,
          naming: config.naming,
        });
        await writeGeneratedFiles(root, config, result);
      }
    );
    codeLensProvider.refresh();
    vscode.window.showInformationMessage(
      `Design Tokens: renamed --${entry.name} to --${nextName.replace(/^--+/, '').trim()}. Source files that already reference the old name were not rewritten.`
    );
  });

  context.subscriptions.push(
    scanCommand,
    generateCommand,
    previewCommand,
    applyCommand,
    undoCommand,
    replaceInFileCommand,
    renameCommand,
    output
  );
}

export function deactivate() {}
