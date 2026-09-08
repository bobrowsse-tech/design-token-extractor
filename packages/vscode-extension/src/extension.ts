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
  PipelineResult,
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
  rewriteTokenReferencesInWorkspace,
  applySemanticAlias,
  listBackupBundles,
  workspaceRootFromBackupDir,
} from '@design-token-extractor/core';
import { DesignTokenCodeLensProvider } from './codeLensProvider';
import { MigrationPreviewPanel } from './previewPanel';
import { ClusterReviewPanel, ReviewPanelState } from './reviewPanel';
import { gitFileState, isGitRepo, rollbackWarning } from './rollbackSafety';
import { readVscodeConfigLayers } from './vscodeConfigLayers';

const execFileAsync = promisify(execFile);
const OUTPUT_CHANNEL_NAME = 'Design Tokens';
const PLAN_FILENAME = '.designtokens-migration.json';
const LAST_BACKUP_KEY = 'designTokens.lastBackupDir';
const LAST_BACKUPS_KEY = 'designTokens.lastBackupDirs';

async function rememberBackups(context: vscode.ExtensionContext, dirs: string[]): Promise<void> {
  await context.workspaceState.update(LAST_BACKUPS_KEY, dirs);
  await context.workspaceState.update(LAST_BACKUP_KEY, dirs[dirs.length - 1]);
}

function lastBackupDirs(context: vscode.ExtensionContext): string[] {
  const many = context.workspaceState.get<string[]>(LAST_BACKUPS_KEY);
  if (many && many.length > 0) return many;
  const one = context.workspaceState.get<string>(LAST_BACKUP_KEY);
  return one ? [one] : [];
}

function workspaceRoots(): string[] {
  return vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
}

function firstWorkspaceRoot(): string | null {
  return workspaceRoots()[0] ?? null;
}

function rootForUri(uri: vscode.Uri): string | null {
  return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? firstWorkspaceRoot();
}

async function pickWorkspaceRoot(placeHolder = 'Workspace folder'): Promise<string | null> {
  const roots = workspaceRoots();
  if (roots.length === 0) return null;
  if (roots.length === 1) return roots[0];
  const picked = await vscode.window.showQuickPick(
    roots.map((root) => ({ label: path.basename(root), description: root, root })),
    { placeHolder }
  );
  return picked?.root ?? null;
}

let pipelineCache: { root: string; result: PipelineResult } | null = null;

function rememberPipeline(root: string, result: PipelineResult): PipelineResult {
  pipelineCache = { root, result };
  return result;
}

function folderScope(root: string): vscode.Uri {
  return vscode.workspace.workspaceFolders?.find((folder) => folder.uri.fsPath === root)?.uri
    ?? vscode.Uri.file(root);
}

async function loadWorkspaceConfig(root: string, output: vscode.OutputChannel): Promise<DesignTokenConfig> {
  const loaded = await loadConfig(root, readVscodeConfigLayers(folderScope(root)));
  if (loaded.source) output.appendLine(`Loaded config from ${loaded.source}`);
  for (const warning of loaded.warnings) output.appendLine(`Config warning: ${warning}`);
  return loaded.config;
}

async function writeLockFile(root: string, outputDir: string, lock: TokensLockFile): Promise<void> {
  const outDir = path.join(root, outputDir);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'tokens.lock.json'), JSON.stringify(lock, null, 2), 'utf8');
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
      const css = generateCssFile(result.tokens, category, result.lockFile.semanticAliases);
      if (css) {
        await fs.writeFile(path.join(outDir, `${category}.css`), css);
        cssCategories.push(category);
      }
    }
    await fs.writeFile(path.join(outDir, 'index.css'), generateCssIndex(cssCategories));
  }
  if (formats.has('scss')) {
    for (const category of CATEGORY_ORDER) {
      const scssContent = generateScssFile(result.tokens, category, result.lockFile.semanticAliases);
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
      [
        { language: 'css' }, { language: 'scss' }, { language: 'sass' }, { language: 'less' },
        { language: 'vue' }, { language: 'html' },
        { language: 'javascript' }, { language: 'javascriptreact' },
        { language: 'typescript' }, { language: 'typescriptreact' },
      ],
      codeLensProvider
    )
  );

  const scanCommand = vscode.commands.registerCommand('designTokens.scanWorkspace', async () => {
    const roots = workspaceRoots();
    if (roots.length === 0) {
      vscode.window.showErrorMessage('Design Tokens: open a folder/workspace first.');
      return;
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Design Tokens: scanning workspace…', cancellable: false },
      async () => {
        const allOccurrences = [];
        let filesScanned = 0;
        let occurrenceCount = 0;
        let lastReportPath = '';
        output.clear();
        for (const root of roots) {
          const config = await loadWorkspaceConfig(root, output);
          const { report, occurrences } = await scanAndExtract(root, config);
          allOccurrences.push(...occurrences);
          filesScanned += report.filesScanned;
          occurrenceCount += report.occurrenceCount;
          const reportPath = path.join(root, '.designtokens-report.json');
          lastReportPath = reportPath;
          await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
          output.appendLine(`${path.basename(root)}: ${report.filesScanned} files, ${report.occurrenceCount} occurrences.`);
          for (const [category, stats] of Object.entries(report.summaryByCategory)) {
            output.appendLine(`  ${category}: ${stats.totalOccurrences} occurrences, ${stats.uniqueValues} unique values`);
          }
        }
        codeLensProvider.setWorkspaceOccurrences(allOccurrences);
        output.show(true);
        const doc = await vscode.workspace.openTextDocument(lastReportPath);
        await vscode.window.showTextDocument(doc, { preview: false });
        vscode.window.showInformationMessage(
          `Design Tokens: found ${occurrenceCount} occurrences across ${filesScanned} files in ${roots.length} folder(s).`
        );
      }
    );
  });

  const generateCommand = vscode.commands.registerCommand('designTokens.generateTokenFiles', async () => {
    const roots = workspaceRoots();
    if (roots.length === 0) {
      vscode.window.showErrorMessage('Design Tokens: open a folder/workspace first.');
      return;
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Design Tokens: generating token files…', cancellable: false },
      async () => {
        let tokenCount = 0;
        const allOccurrences = [];
        for (const root of roots) {
          const config = await loadWorkspaceConfig(root, output);
          const existingLock = await readLockFile(root, config.outputDir);
          const result = rememberPipeline(root, await runPipeline(root, {
            existingLock,
            scanConfig: config,
            clustering: config.clustering,
            naming: config.naming,
            themeDarkMarkers: config.theme.darkMarkers,
          }));
          allOccurrences.push(...result.report.occurrences);
          const outDir = await writeGeneratedFiles(root, config, result);
          tokenCount += result.tokens.length;
          output.appendLine(`${path.basename(root)}: generated ${result.tokens.length} tokens in ${outDir}/`);
        }
        codeLensProvider.setWorkspaceOccurrences(allOccurrences);
        output.show(true);
        vscode.window.showInformationMessage(`Design Tokens: generated ${tokenCount} tokens in ${roots.length} folder(s).`);
      }
    );
  });

  const previewCommand = vscode.commands.registerCommand('designTokens.previewMigration', async () => {
    const roots = workspaceRoots();
    if (roots.length === 0) {
      vscode.window.showErrorMessage('Design Tokens: open a folder/workspace first.');
      return;
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Design Tokens: building migration preview…', cancellable: false },
      async () => {
        const items = [];
        for (const root of roots) {
          const config = await loadWorkspaceConfig(root, output);
          const existingLock = await readLockFile(root, config.outputDir);
          const result = rememberPipeline(root, await runPipeline(root, {
            existingLock,
            scanConfig: config,
            clustering: config.clustering,
            naming: config.naming,
            themeDarkMarkers: config.theme.darkMarkers,
          }));
          const { occurrences } = await scanAndExtract(root, config);
          const folderPlan = buildMigrationPlan(occurrences, result.tokens, (category, value) => (
            nameSingleValue(category, value, config.naming)
          ));
          items.push(...folderPlan.items.map((item) => ({ ...item, root })));
        }
        const plan = { version: 1 as const, generatedAt: new Date().toISOString(), items };
        await writePlan(roots[0], plan);
        MigrationPreviewPanel.show(context, plan, async (nextPlan) => {
          await writePlan(roots[0], nextPlan);
          await vscode.commands.executeCommand('designTokens.applyMigration');
        });
      }
    );
  });

  const applyCommand = vscode.commands.registerCommand('designTokens.applyMigration', async () => {
    const fallbackRoot = firstWorkspaceRoot();
    if (!fallbackRoot) {
      vscode.window.showErrorMessage('Design Tokens: open a folder/workspace first.');
      return;
    }

    const plan = MigrationPreviewPanel.current?.getPlan() ?? await readPlan(fallbackRoot);
    if (!plan) {
      vscode.window.showErrorMessage('Design Tokens: run "Preview Migration" first and accept the replacements you want.');
      return;
    }

    const accepted = plan.items.filter((item) => item.accepted && item.safe);
    if (accepted.length === 0) {
      vscode.window.showInformationMessage('Design Tokens: no accepted safe replacements to apply.');
      return;
    }

    const byRoot = new Map<string, typeof accepted>();
    for (const item of accepted) {
      const itemRoot = item.root ?? fallbackRoot;
      const list = byRoot.get(itemRoot) ?? [];
      list.push(item);
      byRoot.set(itemRoot, list);
    }

    const gitMissing: string[] = [];
    for (const root of byRoot.keys()) {
      if (!(await isGitRepo(root))) gitMissing.push(root);
    }
    if (gitMissing.length > 0) {
      const proceed = await vscode.window.showWarningMessage(
        'No automatic rollback available — at least one folder is not a git repo. A local backup will be kept for "Design Tokens: Undo Last Migration".',
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

    const backupDirs: string[] = [];
    let replacedCount = 0;
    for (const [root, items] of byRoot) {
      const backups = await snapshotFiles(root, items.map((item) => item.file));
      const backupDir = await writeBackupBundle(root, backups);
      backupDirs.push(backupDir);
      const tag = await tagPreMigration(root);
      const folderPlan = { ...plan, items: plan.items.filter((item) => (item.root ?? fallbackRoot) === root) };
      const result = await applyMigrationPlan(root, folderPlan);
      replacedCount += result.replacedCount;
      output.appendLine(`${path.basename(root)}: applied ${result.replacedCount} replacement(s) in ${result.filesWritten.length} file(s).`);
      if (tag) output.appendLine(`  Pre-migration git tag: ${tag}`);
      output.appendLine(`  Backup: ${backupDir}`);
    }
    await rememberBackups(context, backupDirs);
    codeLensProvider.refresh();
    output.show(true);
    vscode.window.showInformationMessage(
      `Design Tokens: applied ${replacedCount} replacement(s). Run "Design Tokens: Undo Last Migration" or "Undo From History" to restore a backup.`
    );
  });

  const undoCommand = vscode.commands.registerCommand('designTokens.undoMigration', async () => {
    const dirs = lastBackupDirs(context);
    if (dirs.length === 0) {
      vscode.window.showErrorMessage('Design Tokens: no migration backup found in this workspace.');
      return;
    }
    const restored: string[] = [];
    for (const backupDir of dirs) {
      const root = workspaceRootFromBackupDir(backupDir);
      restored.push(...await restoreBackupIntoEditors(root, backupDir));
    }
    codeLensProvider.refresh();
    vscode.window.showInformationMessage(`Design Tokens: restored ${restored.length} file(s) from the last migration backup.`);
  });

  const replaceInFileCommand = vscode.commands.registerCommand(
    'designTokens.replaceInFile',
    async (uri: vscode.Uri, rawValue: string, category: TokenCategory) => {
      const root = rootForUri(uri);
      const config = root ? await loadWorkspaceConfig(root, output) : null;
      const lock = root && config ? await readLockFile(root, config.outputDir) : null;
      const lockedEntry = lock?.entries.find((e) => {
        if (e.id === computeStableId(category, rawValue)) return true;
        if (category !== 'color' || e.category !== 'color') return false;
        const wanted = normalizeColorKey(rawValue);
        const locked = normalizeColorKey(e.value);
        return wanted !== null && wanted === locked;
      });
      const tokenName = lockedEntry?.name ?? nameSingleValue(category, rawValue, config?.naming ?? '');

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
        vscode.window.showInformationMessage('Design Tokens: nothing safe to replace (ambiguous repeats in the same declaration).');
        return;
      }

      if (root) {
        const relativePath = path.relative(root, uri.fsPath);
        const backupDir = await writeBackupBundle(root, [{ relativePath, contents: source }]);
        await rememberBackups(context, [backupDir]);
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
    const root = await pickWorkspaceRoot('Folder to rename a token in');
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
        { placeHolder: 'Token to rename (updates the lockfile and rewrites var(--old) / $old in source)' }
      );
      if (!picked) return;
      entry = picked.item;
    }

    const nextName = await vscode.window.showInputBox({
      prompt: `New name for --${entry.name}`,
      value: entry.name,
      validateInput: (value) => (/^[A-Za-z][A-Za-z0-9_-]*$/.test(value.replace(/^--+/, '').trim())
        ? undefined
        : 'Use a name starting with a letter (kebab, camel, pascal, or snake)'),
    });
    if (!nextName) return;

    const updatedLock = renameLockEntry(lock, entry.id, nextName);
    const cleanName = nextName.replace(/^--+/, '').trim();
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Design Tokens: renaming token…', cancellable: false },
      async () => {
        const rewritten = await rewriteTokenReferencesInWorkspace(root, entry.name, cleanName, config);
        const result = rememberPipeline(root, await runPipeline(root, {
          existingLock: updatedLock,
          scanConfig: config,
          clustering: config.clustering,
          naming: config.naming,
          themeDarkMarkers: config.theme.darkMarkers,
        }));
        await writeGeneratedFiles(root, config, result);
        output.appendLine(`Rewrote ${rewritten.replacedCount} source reference(s) in ${rewritten.filesWritten.length} file(s).`);
      }
    );
    codeLensProvider.refresh();
    vscode.window.showInformationMessage(
      `Design Tokens: renamed --${entry.name} to --${cleanName} and rewrote matching source references.`
    );
  });

  const reviewCommand = vscode.commands.registerCommand('designTokens.reviewClusters', async () => {
    const root = await pickWorkspaceRoot('Folder to review clusters in');
    if (!root) {
      vscode.window.showErrorMessage('Design Tokens: open a folder/workspace first.');
      return;
    }

    const config = await loadWorkspaceConfig(root, output);
    let result = pipelineCache?.root === root ? pipelineCache.result : null;
    if (!result) {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Design Tokens: preparing cluster review…', cancellable: false },
        async () => {
          const existingLock = await readLockFile(root, config.outputDir);
          result = rememberPipeline(root, await runPipeline(root, {
            existingLock,
            scanConfig: config,
            clustering: config.clustering,
            naming: config.naming,
            themeDarkMarkers: config.theme.darkMarkers,
          }));
        }
      );
    }
    if (!result) return;

    const persist = async (state: ReviewPanelState) => {
      await writeLockFile(root, config.outputDir, state.lock);
      if (pipelineCache?.root === root) {
        pipelineCache = {
          root,
          result: {
            ...pipelineCache.result,
            tokens: state.tokens,
            lockFile: state.lock,
            freshClusters: state.freshClusters,
            freshTokens: state.freshTokens,
          },
        };
      }
    };

    ClusterReviewPanel.show(context, {
      decisions: {},
      lock: result.lockFile,
      tokens: result.tokens,
      freshClusters: result.freshClusters,
      freshTokens: result.freshTokens,
    }, persist);
  });

  const semanticCommand = vscode.commands.registerCommand('designTokens.mapSemantics', async () => {
    const root = await pickWorkspaceRoot('Folder to map semantic aliases in');
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
    const picked = await vscode.window.showQuickPick(
      lock.entries.map((item) => ({
        label: `--${item.name}`,
        description: lock.semanticAliases?.[item.name] ? `alias → --${lock.semanticAliases[item.name]}` : item.value,
        item,
      })),
      { placeHolder: 'Primitive token to alias to a semantic role' }
    );
    if (!picked) return;
    const semanticName = await vscode.window.showInputBox({
      prompt: `Semantic name for --${picked.item.name} (emitted as an alias)`,
      value: lock.semanticAliases?.[picked.item.name] ?? '',
      validateInput: (value) => (/^[a-z][a-z0-9-_]*$/i.test(value.replace(/^--+/, '').trim())
        ? undefined
        : 'Use a name starting with a letter'),
    });
    if (!semanticName) return;
    const updated = applySemanticAlias(lock, picked.item.name, semanticName);
    await writeLockFile(root, config.outputDir, updated);
    const result = rememberPipeline(root, await runPipeline(root, {
      existingLock: updated,
      scanConfig: config,
      clustering: config.clustering,
      naming: config.naming,
      themeDarkMarkers: config.theme.darkMarkers,
    }));
    await writeGeneratedFiles(root, config, result);
    vscode.window.showInformationMessage(`Design Tokens: aliased --${picked.item.name} → --${semanticName.replace(/^--+/, '').trim()}.`);
  });

  const undoHistoryCommand = vscode.commands.registerCommand('designTokens.undoHistory', async () => {
    const root = await pickWorkspaceRoot('Folder to restore a backup in');
    if (!root) {
      vscode.window.showErrorMessage('Design Tokens: open a folder/workspace first.');
      return;
    }
    const history = await listBackupBundles(root);
    if (history.length === 0) {
      vscode.window.showErrorMessage('Design Tokens: no migration backups found.');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      history.map((item) => ({
        label: item.createdAt,
        description: `${item.files.length} file(s)`,
        detail: item.dir,
        item,
      })),
      { placeHolder: 'Backup snapshot to restore' }
    );
    if (!picked) return;
    const restored = await restoreBackupIntoEditors(root, picked.item.dir);
    await rememberBackups(context, [picked.item.dir]);
    codeLensProvider.refresh();
    vscode.window.showInformationMessage(`Design Tokens: restored ${restored.length} file(s) from ${picked.item.createdAt}.`);
  });

  const configWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration('designTokens')) return;
    codeLensProvider.refresh();
    if (
      event.affectsConfiguration('designTokens.include')
      || event.affectsConfiguration('designTokens.exclude')
      || event.affectsConfiguration('designTokens.outputDir')
      || event.affectsConfiguration('designTokens.naming')
      || event.affectsConfiguration('designTokens.clustering')
      || event.affectsConfiguration('designTokens.theme')
    ) {
      pipelineCache = null;
    }
  });

  context.subscriptions.push(
    scanCommand,
    generateCommand,
    previewCommand,
    applyCommand,
    undoCommand,
    replaceInFileCommand,
    renameCommand,
    reviewCommand,
    semanticCommand,
    undoHistoryCommand,
    configWatcher,
    output
  );
}

export function deactivate() {}
