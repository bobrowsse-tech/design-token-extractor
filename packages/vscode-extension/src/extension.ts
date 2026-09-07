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
} from '@design-token-extractor/core';
import { DesignTokenCodeLensProvider } from './codeLensProvider';
import { MigrationPreviewPanel } from './previewPanel';

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

async function isGitRepo(root: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root });
    return true;
  } catch {
    return false;
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
    generateDesignSystemReadme(result.tokens, result.contrastFindings, result.themePairs)
  );
  return outDir;
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
        'This folder is not a git repository. Apply will write source files. A local backup will be kept so you can run "Undo Migration", but there is no automatic git rollback.',
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
      `Design Tokens: applied ${result.replacedCount} replacement(s). Use "Undo Migration" to restore the backup.`
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
    const restored = await restoreBackupBundle(root, backupDir);
    codeLensProvider.refresh();
    vscode.window.showInformationMessage(`Design Tokens: restored ${restored.length} file(s) from the last migration backup.`);
  });

  const replaceInFileCommand = vscode.commands.registerCommand(
    'designTokens.replaceInFile',
    async (uri: vscode.Uri, rawValue: string, category: TokenCategory) => {
      const root = firstWorkspaceRoot();
      const config = root ? await loadWorkspaceConfig(root, output) : null;
      const lock = root && config ? await readLockFile(root, config.outputDir) : null;
      const lockedEntry = lock?.entries.find((e) => e.id === computeStableId(category, rawValue));
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
      vscode.window.showInformationMessage(`Design Tokens: replaced ${result.replacedCount} occurrence(s) with --${tokenName}.`);
      codeLensProvider.refresh();
    }
  );

  context.subscriptions.push(
    scanCommand,
    generateCommand,
    previewCommand,
    applyCommand,
    undoCommand,
    replaceInFileCommand,
    output
  );
}

export function deactivate() {}
