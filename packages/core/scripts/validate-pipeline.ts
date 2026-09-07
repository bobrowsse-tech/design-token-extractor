/**
 * Run with: npx tsx packages/core/scripts/validate-pipeline.ts
 *
 * This validates everything EXCEPT parser/extractor.ts (which needs the
 * postcss/postcss-scss dependencies — unavailable in the sandbox this was
 * built in, no npm registry access). Everything downstream of extraction
 * (clustering, theme pairing, naming, lockfile reconciliation, contrast
 * checking, and all six generators) is pure TypeScript with zero runtime
 * dependencies, so it runs directly here with tsx and is validated for
 * real, not just described.
 */
import * as fs from 'fs';
import * as path from 'path';
import { TokenOccurrence } from '../src/types';
import { clusterOccurrences, detectSpacingScale } from '../src/clustering/cluster';
import { detectThemePairs } from '../src/clustering/themePairing';
import { nameClusters } from '../src/naming/nameGenerator';
import { computeStableId, createLockFile, reconcileWithLockFile } from '../src/lockfile/tokensLock';
import { checkContrast } from '../src/a11y/contrastChecker';
import { generateCssFile, generateCssIndex } from '../src/generator/cssGenerator';
import { generateScssFile } from '../src/generator/scssGenerator';
import { generateDtcgJson } from '../src/generator/dtcgGenerator';
import { generateTokensStudioJson } from '../src/generator/tokensStudioGenerator';
import { generateStylelintConfig } from '../src/generator/stylelintConfigGenerator';
import { generateDesignSystemReadme } from '../src/generator/readmeGenerator';

const fixturePath = path.join(__dirname, '..', 'fixtures', 'sample-occurrences.json');
const occurrences: TokenOccurrence[] = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

console.log(`Loaded ${occurrences.length} fixture occurrences.\n`);

// --- Clustering ---
const clusters = clusterOccurrences(occurrences);
const clustersWithIds = clusters.map((c) => ({ ...c, id: computeStableId(c.category, c.canonicalValue) }));
console.log(`=== Clustering: ${clustersWithIds.length} clusters ===`);
const fuzzyFlagged = clustersWithIds.filter((c) => c.requiresApproval);
console.log(`  ${fuzzyFlagged.length} flagged as needing fuzzy-match approval (never auto-merged):`);
for (const c of fuzzyFlagged) {
  console.log(`    [${c.category}] ${c.canonicalValue} (confidence ${c.confidence.toFixed(2)})`);
}

const scale = detectSpacingScale(clustersWithIds);
console.log(`\n=== Spacing scale detection ===`);
console.log(scale ? `  Detected step: ${scale.stepRem * 16}px, values (px): ${scale.values.map((v) => v * 16).join(', ')}` : '  No consistent scale detected');

// --- Naming ---
const namedTokens = nameClusters(clustersWithIds);
console.log(`\n=== Naming: ${namedTokens.length} tokens ===`);
for (const t of namedTokens) {
  console.log(`  --${t.name}: ${t.value}  (${t.occurrenceCount}x / ${t.fileCount} files)`);
}

// --- Lockfile: simulate first run then a second run to prove names don't churn ---
const firstLock = createLockFile(namedTokens);
console.log(`\n=== Lockfile: first run ===`);
console.log(`  ${firstLock.entries.length} entries written to tokens.lock.json`);

// Second "run": re-derive tokens from the same occurrences (simulating a
// rescan) and reconcile against the lock written above.
const secondPassClusters = clusterOccurrences(occurrences).map((c) => ({ ...c, id: computeStableId(c.category, c.canonicalValue) }));
const secondPassNamed = nameClusters(secondPassClusters);
const { diff } = reconcileWithLockFile(secondPassNamed, firstLock);
console.log(`=== Lockfile: second run (reconciled) ===`);
console.log(`  unchanged: ${diff.unchanged}, added: ${diff.added.length}, removed: ${diff.removed.length}, name-drift-prevented: ${diff.renamed.length}`);

// --- Theme pairing ---
const themePairs = detectThemePairs(occurrences);
console.log(`\n=== Theme pairing: ${themePairs.length} pair(s) detected ===`);
for (const p of themePairs) {
  console.log(`  ${p.property} on "${p.baseSelector}": light=${p.lightValue} dark=${p.darkValue}`);
}

// --- Contrast ---
const contrastFindings = checkContrast(occurrences);
console.log(`\n=== WCAG contrast: ${contrastFindings.length} pair(s) checked ===`);
for (const f of contrastFindings) {
  console.log(`  ${f.selector}: ${f.foreground} on ${f.background} -> ${f.ratio}:1 (AA ${f.passesAA ? 'pass' : 'FAIL'}, AAA ${f.passesAAA ? 'pass' : 'fail'})`);
}

// --- Generators ---
console.log(`\n=== Generated CSS (color.css) ===`);
console.log(generateCssFile(namedTokens, 'color'));

console.log(`=== Generated SCSS (spacing.scss) ===`);
console.log(generateScssFile(namedTokens, 'spacing'));

console.log(`=== Generated CSS index ===`);
console.log(generateCssIndex([...new Set(namedTokens.map((t) => t.category))]));

console.log(`=== Generated DTCG JSON (excerpt) ===`);
console.log(generateDtcgJson(namedTokens).split('\n').slice(0, 12).join('\n') + '\n  ...');

console.log(`\n=== Generated Tokens Studio JSON (excerpt) ===`);
console.log(generateTokensStudioJson(namedTokens).split('\n').slice(0, 12).join('\n') + '\n  ...');

console.log(`\n=== Generated Stylelint config ===`);
console.log(generateStylelintConfig(new Set(namedTokens.map((t) => t.category))));

console.log(`=== Generated README (excerpt) ===`);
console.log(generateDesignSystemReadme(namedTokens, contrastFindings, themePairs).split('\n').slice(0, 20).join('\n') + '\n  ...');

console.log('\nAll modules ran without throwing. Validation complete.');
