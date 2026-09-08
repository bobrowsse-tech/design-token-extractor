import * as fs from 'fs/promises';
import * as path from 'path';
import { TokenCategory, TokenOccurrence, NamedToken } from '../types';
import { computeStableId } from '../lockfile/tokensLock';
import { isStylesheetFile, parseStylesheet } from '../parser/parseStylesheet';
import { applyRewriteReplacements, findLiteralRange } from './simpleValueRewriter';
import { uniqueSubstringReplace } from './tokenReferences';

export type SkipReason =
  | 'shorthand'
  | 'calc'
  | 'custom-property-definition'
  | 'vendor-prefix'
  | 'media-breakpoint'
  | 'ambiguous';

export interface MigrationItem {
  id: string;
  file: string;
  line: number;
  column: number;
  selector: string;
  property: string;
  rawValue: string;
  fullDeclarationValue: string;
  category: TokenCategory;
  tokenName: string;
  replacement: string;
  safe: boolean;
  accepted: boolean;
  skipReason?: SkipReason;
  /** True when the replacement is a unique substring (shorthand, calc, media, var fallback). */
  assisted?: boolean;
  root?: string;
}

export interface MigrationPlan {
  version: 1;
  generatedAt: string;
  items: MigrationItem[];
  categoryFilter?: TokenCategory;
}

export interface ApplyResult {
  filesWritten: string[];
  replacedCount: number;
  skippedCount: number;
}

const VENDOR_PREFIX = /^-(webkit|moz|ms|o)-/;

function varStyleForFile(filePath: string): 'css' | 'scss' {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.scss' || ext === '.sass' ? 'scss' : 'css';
}

function tokenReference(tokenName: string, style: 'css' | 'scss'): string {
  return style === 'scss' ? `$${tokenName}` : `var(--${tokenName})`;
}

function countSubstrings(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) break;
    count++;
    from = index + needle.length;
  }
  return count;
}

export function classifyRewriteSafety(occurrence: TokenOccurrence): SkipReason | null {
  if (occurrence.composite?.kind === 'typography') {
    return 'shorthand';
  }
  if (occurrence.property.startsWith('--')) {
    return 'custom-property-definition';
  }
  if (VENDOR_PREFIX.test(occurrence.property)) {
    return 'vendor-prefix';
  }
  const full = occurrence.fullDeclarationValue;
  const raw = occurrence.rawValue.trim();
  if (full.trim() === raw) return null;
  if (countSubstrings(full, raw) === 1) return null;
  return 'ambiguous';
}

export function isAssistedRewrite(occurrence: TokenOccurrence): boolean {
  return classifyRewriteSafety(occurrence) === null
    && occurrence.fullDeclarationValue.trim() !== occurrence.rawValue.trim();
}

function lookupTokenName(
  occurrence: TokenOccurrence,
  tokensById: Map<string, NamedToken>,
  tokensByValue: Map<string, NamedToken>
): string | null {
  const id = computeStableId(occurrence.category, occurrence.rawValue);
  const byId = tokensById.get(id);
  if (byId) return byId.name;
  const byExact = tokensByValue.get(`${occurrence.category}::${occurrence.rawValue.trim()}`);
  if (byExact) return byExact.name;
  const byLower = tokensByValue.get(`${occurrence.category}::${occurrence.rawValue.trim().toLowerCase()}`);
  return byLower?.name ?? null;
}

export function buildMigrationPlan(
  occurrences: TokenOccurrence[],
  tokens: NamedToken[],
  nameFallback: (category: TokenCategory, value: string) => string
): MigrationPlan {
  const tokensById = new Map(tokens.map((t) => [t.clusterId || computeStableId(t.category, t.value), t]));
  const tokensByValue = new Map<string, NamedToken>();
  for (const token of tokens) {
    tokensByValue.set(`${token.category}::${token.value.trim()}`, token);
    tokensByValue.set(`${token.category}::${token.value.trim().toLowerCase()}`, token);
  }

  const items: MigrationItem[] = occurrences.map((occurrence, index) => {
    const skipReason = classifyRewriteSafety(occurrence);
    const tokenName = lookupTokenName(occurrence, tokensById, tokensByValue)
      ?? nameFallback(occurrence.category, occurrence.rawValue);
    const replacement = tokenReference(tokenName, varStyleForFile(occurrence.file));
    const safe = skipReason === null;
    const assisted = isAssistedRewrite(occurrence);
    return {
      id: `${occurrence.file}:${occurrence.line}:${occurrence.column}:${occurrence.property}:${index}`,
      file: occurrence.file,
      line: occurrence.line,
      column: occurrence.column,
      selector: occurrence.selector,
      property: occurrence.property,
      rawValue: occurrence.rawValue,
      fullDeclarationValue: occurrence.fullDeclarationValue,
      category: occurrence.category,
      tokenName,
      replacement,
      safe,
      accepted: safe,
      skipReason: skipReason ?? undefined,
      assisted,
    };
  });

  return { version: 1, generatedAt: new Date().toISOString(), items };
}

function locationKey(item: Pick<MigrationItem, 'line' | 'column' | 'property'>): string {
  return `${item.line}:${item.column}:${item.property}`;
}

function rewriteHaystack(haystack: string, item: MigrationItem): string | null {
  const next = uniqueSubstringReplace(haystack, item.rawValue, item.replacement);
  if (next) return next;
  if (haystack.trim() === item.rawValue.trim() || haystack.trim() === item.fullDeclarationValue.trim()) {
    return item.replacement;
  }
  return null;
}

function applyMigrationToText(
  contents: string,
  accepted: MigrationItem[]
): { newContents: string; replacedCount: number } {
  const replacements: { startOffset: number; endOffset: number; originalValue: string; replacement: string }[] = [];
  for (const item of accepted) {
    const range = findLiteralRange(contents, item.line, item.column, item.rawValue);
    if (!range) continue;
    replacements.push({
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      originalValue: item.rawValue,
      replacement: item.replacement,
    });
  }
  const unique = replacements.filter((item, index) => (
    replacements.findIndex((other) => other.startOffset === item.startOffset && other.endOffset === item.endOffset) === index
  ));
  if (unique.length === 0) return { newContents: contents, replacedCount: 0 };
  return {
    newContents: applyRewriteReplacements(contents, unique),
    replacedCount: unique.length,
  };
}

function applyMigrationViaAst(
  filePath: string,
  contents: string,
  accepted: MigrationItem[]
): { newContents: string; replacedCount: number } {
  const wanted = new Map<string, MigrationItem[]>();
  for (const item of accepted) {
    const key = locationKey(item);
    const list = wanted.get(key) ?? [];
    list.push(item);
    wanted.set(key, list);
  }

  const root = parseStylesheet(filePath, contents);
  let replacedCount = 0;

  root.walkDecls((decl) => {
    const line = decl.source?.start?.line ?? 0;
    const column = decl.source?.start?.column ?? 0;
    const key = `${line}:${column}:${decl.prop.trim().toLowerCase()}`;
    const list = wanted.get(key);
    if (!list) return;
    for (let i = 0; i < list.length; ) {
      const next = rewriteHaystack(decl.value, list[i]);
      if (!next) {
        i += 1;
        continue;
      }
      decl.value = next;
      replacedCount += 1;
      list.splice(i, 1);
    }
    if (list.length === 0) wanted.delete(key);
  });

  root.walkAtRules('media', (atRule) => {
    const line = atRule.source?.start?.line ?? 0;
    const column = atRule.source?.start?.column ?? 0;
    for (const [key, list] of [...wanted.entries()]) {
      for (let i = 0; i < list.length; ) {
        const item = list[i];
        if (item.property !== '@media' && item.category !== 'breakpoint') {
          i += 1;
          continue;
        }
        if (item.line !== line || item.column !== column) {
          i += 1;
          continue;
        }
        const next = rewriteHaystack(atRule.params, item);
        if (!next) {
          i += 1;
          continue;
        }
        atRule.params = next;
        replacedCount += 1;
        list.splice(i, 1);
      }
      if (list.length === 0) wanted.delete(key);
    }
  });

  return { newContents: root.toString(), replacedCount };
}

export function applyMigrationToSource(
  filePath: string,
  contents: string,
  items: MigrationItem[]
): { newContents: string; replacedCount: number } {
  const accepted = items.filter((item) => item.accepted && item.safe);
  if (accepted.length === 0) return { newContents: contents, replacedCount: 0 };
  if (!isStylesheetFile(filePath)) return applyMigrationToText(contents, accepted);
  try {
    return applyMigrationViaAst(filePath, contents, accepted);
  } catch {
    return applyMigrationToText(contents, accepted);
  }
}

export function filterPlanByCategory(plan: MigrationPlan, category?: TokenCategory): MigrationPlan {
  if (!category) return { ...plan, categoryFilter: undefined };
  return {
    ...plan,
    categoryFilter: category,
    items: plan.items.map((item) => (
      item.category === category ? item : { ...item, accepted: false }
    )),
  };
}

export async function applyMigrationPlan(
  workspaceRoot: string,
  plan: MigrationPlan
): Promise<ApplyResult> {
  const byFile = new Map<string, MigrationItem[]>();
  for (const item of plan.items) {
    if (!item.accepted || !item.safe) continue;
    if (plan.categoryFilter && item.category !== plan.categoryFilter) continue;
    const list = byFile.get(item.file) ?? [];
    list.push(item);
    byFile.set(item.file, list);
  }

  const filesWritten: string[] = [];
  let replacedCount = 0;
  const skippedCount = plan.items.filter((item) => !item.accepted || !item.safe).length;

  for (const [relativePath, items] of byFile) {
    const root = items[0]?.root ?? workspaceRoot;
    const absolutePath = path.join(root, relativePath);
    const contents = await fs.readFile(absolutePath, 'utf8');
    const { newContents, replacedCount: fileCount } = applyMigrationToSource(absolutePath, contents, items);
    if (fileCount > 0 && newContents !== contents) {
      await fs.writeFile(absolutePath, newContents, 'utf8');
      filesWritten.push(relativePath);
      replacedCount += fileCount;
    }
  }

  return { filesWritten, replacedCount, skippedCount };
}
