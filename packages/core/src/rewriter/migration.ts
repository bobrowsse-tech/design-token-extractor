import * as fs from 'fs/promises';
import * as path from 'path';
import * as postcss from 'postcss';
import * as scss from 'postcss-scss';
import { TokenCategory, TokenOccurrence, NamedToken } from '../types';
import { computeStableId } from '../lockfile/tokensLock';

export type SkipReason =
  | 'shorthand'
  | 'calc'
  | 'custom-property-definition'
  | 'vendor-prefix'
  | 'media-breakpoint';

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
}

export interface MigrationPlan {
  version: 1;
  generatedAt: string;
  items: MigrationItem[];
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

function parseStylesheet(filePath: string, contents: string): postcss.Root {
  return varStyleForFile(filePath) === 'scss'
    ? scss.parse(contents, { from: filePath })
    : postcss.parse(contents, { from: filePath });
}

export function classifyRewriteSafety(occurrence: TokenOccurrence): SkipReason | null {
  if (occurrence.property === '@media' || occurrence.category === 'breakpoint') {
    return 'media-breakpoint';
  }
  if (occurrence.property.startsWith('--')) {
    return 'custom-property-definition';
  }
  if (VENDOR_PREFIX.test(occurrence.property)) {
    return 'vendor-prefix';
  }
  const full = occurrence.fullDeclarationValue.trim();
  if (/\bcalc\s*\(/i.test(full)) {
    return 'calc';
  }
  if (full !== occurrence.rawValue.trim()) {
    return 'shorthand';
  }
  return null;
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
    };
  });

  return { version: 1, generatedAt: new Date().toISOString(), items };
}

function itemKey(item: Pick<MigrationItem, 'line' | 'column' | 'property' | 'rawValue'>): string {
  return `${item.line}:${item.column}:${item.property}:${item.rawValue.trim()}`;
}

export function applyMigrationToSource(
  filePath: string,
  contents: string,
  items: MigrationItem[]
): { newContents: string; replacedCount: number } {
  const accepted = items.filter((item) => item.accepted && item.safe);
  if (accepted.length === 0) return { newContents: contents, replacedCount: 0 };

  const wanted = new Map<string, MigrationItem>();
  for (const item of accepted) wanted.set(itemKey(item), item);

  const root = parseStylesheet(filePath, contents);
  let replacedCount = 0;

  root.walkDecls((decl) => {
    const line = decl.source?.start?.line ?? 0;
    const column = decl.source?.start?.column ?? 0;
    const key = `${line}:${column}:${decl.prop.trim().toLowerCase()}:${decl.value.trim()}`;
    const item = wanted.get(key);
    if (!item) return;
    decl.value = item.replacement;
    replacedCount += 1;
    wanted.delete(key);
  });

  return { newContents: root.toString(), replacedCount };
}

export async function applyMigrationPlan(
  workspaceRoot: string,
  plan: MigrationPlan
): Promise<ApplyResult> {
  const byFile = new Map<string, MigrationItem[]>();
  for (const item of plan.items) {
    if (!item.accepted || !item.safe) continue;
    const list = byFile.get(item.file) ?? [];
    list.push(item);
    byFile.set(item.file, list);
  }

  const filesWritten: string[] = [];
  let replacedCount = 0;
  const skippedCount = plan.items.filter((item) => !item.accepted || !item.safe).length;

  for (const [relativePath, items] of byFile) {
    const absolutePath = path.join(workspaceRoot, relativePath);
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
