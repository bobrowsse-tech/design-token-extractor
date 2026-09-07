#!/usr/bin/env node
import { parseArgs } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  runPipeline,
  scanAndExtract,
  generateCssFile,
  generateCssIndex,
  generateScssFile,
  generateDtcgJson,
  generateTokensStudioJson,
  generateStylelintConfig,
  generateDesignSystemReadme,
  loadConfig,
  CATEGORY_ORDER,
  TokenCategory,
  TokensLockFile,
} from '@design-token-extractor/core';

const HELP = `
design-tokens — scan CSS/SCSS for hardcoded values and manage a token system.
Reads .designtokenrc.json from --dir when present.

Usage:
  design-tokens scan [--dir <path>] [--json]
      Scan only, print a summary (or the full report with --json). Never
      writes any file — safe to run anywhere, including CI without write
      access.

  design-tokens generate [--dir <path>] [--out <tokensDir>]
      Full pipeline: scan, cluster, name, reconcile against tokens.lock.json,
      and write token files. Never touches your source CSS — use the VS Code
      Preview / Apply commands for that.

  design-tokens check [--dir <path>]
      CI-friendly: re-runs the scan and fails (exit code 1) if any NEW
      hardcoded value shows up that doesn't match an existing tokens.lock.json
      entry.
`;

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      dir: { type: 'string', default: process.cwd() },
      out: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  const command = positionals[0];
  if (values.help || !command) {
    console.log(HELP);
    process.exit(command ? 0 : 1);
  }

  const root = path.resolve(values.dir as string);
  const loaded = await loadConfig(root);
  for (const warning of loaded.warnings) console.warn(`design-tokens: ${warning}`);
  const config = loaded.config;

  if (command === 'scan') {
    const { report } = await scanAndExtract(root, config);
    if (values.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`Scanned ${report.filesScanned} files, ${report.occurrenceCount} occurrences.`);
      for (const [category, stats] of Object.entries(report.summaryByCategory)) {
        console.log(`  ${category}: ${stats.totalOccurrences} occurrences, ${stats.uniqueValues} unique values`);
      }
    }
    return;
  }

  if (command === 'generate' || command === 'check') {
    const outDir = path.resolve(root, (values.out as string | undefined) ?? config.outputDir);
    const lockPath = path.join(outDir, 'tokens.lock.json');
    let existingLock: TokensLockFile | null = null;
    try {
      existingLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    } catch {
      // First run — no lockfile yet.
    }

    const result = await runPipeline(root, {
      existingLock,
      scanConfig: config,
      clustering: config.clustering,
      naming: config.naming,
    });

    if (command === 'check') {
      if (result.lockDiff.added.length > 0) {
        console.error(`design-tokens check: FAILED — ${result.lockDiff.added.length} new hardcoded value(s) found with no matching token:`);
        for (const entry of result.lockDiff.added) {
          console.error(`  [${entry.category}] ${entry.value}`);
        }
        console.error('\nRun "design-tokens generate" to update tokens.lock.json, or use an existing token instead.');
        process.exit(1);
      }
      console.log('design-tokens check: passed, no new untracked hardcoded values.');
      return;
    }

    fs.mkdirSync(outDir, { recursive: true });
    const categoriesPresent = [...new Set(result.tokens.map((t) => t.category))];
    const formats = new Set(config.outputFormats);

    if (formats.has('css')) {
      const cssCategories: TokenCategory[] = [];
      for (const category of CATEGORY_ORDER) {
        const css = generateCssFile(result.tokens, category);
        if (css) {
          fs.writeFileSync(path.join(outDir, `${category}.css`), css);
          cssCategories.push(category);
        }
      }
      fs.writeFileSync(path.join(outDir, 'index.css'), generateCssIndex(cssCategories));
    }
    if (formats.has('scss')) {
      for (const category of CATEGORY_ORDER) {
        const scss = generateScssFile(result.tokens, category);
        if (scss) fs.writeFileSync(path.join(outDir, `_${category}.scss`), scss);
      }
    }
    if (formats.has('json-dtcg')) {
      fs.writeFileSync(path.join(outDir, 'tokens.dtcg.json'), generateDtcgJson(result.tokens));
    }
    if (formats.has('tokens-studio')) {
      fs.writeFileSync(path.join(outDir, 'tokens.tokensstudio.json'), generateTokensStudioJson(result.tokens));
    }
    fs.writeFileSync(lockPath, JSON.stringify(result.lockFile, null, 2));
    fs.writeFileSync(path.join(root, '.stylelintrc.json'), generateStylelintConfig(new Set(categoriesPresent)));
    fs.writeFileSync(path.join(outDir, 'README.md'), generateDesignSystemReadme(result.tokens, result.contrastFindings, result.themePairs));

    console.log(`Wrote ${result.tokens.length} tokens to ${outDir}/`);
    console.log(`  lockfile: unchanged ${result.lockDiff.unchanged}, added ${result.lockDiff.added.length}, removed ${result.lockDiff.removed.length}`);
    if (result.themePairs.length) console.log(`  ${result.themePairs.length} light/dark pair(s) detected — see ${outDir}/README.md`);
    const failingContrast = result.contrastFindings.filter((f) => !f.passesAA);
    if (failingContrast.length) console.log(`  ${failingContrast.length} color pair(s) fail WCAG AA contrast — see ${outDir}/README.md`);
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.log(HELP);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
