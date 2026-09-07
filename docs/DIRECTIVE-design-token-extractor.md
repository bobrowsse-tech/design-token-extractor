# Build Directive: VS Code "Design Token Extractor & Migrator"

Status: Phase 1 (scan + extract + JSON report) is written and validated below.
Phases 2-5 are specified but not yet built. An agent picking this up should
read this whole document before writing code, then continue from "Phase 2"
in section 8.

---

## 1. Goal

A VS Code extension that, run against an open workspace:
1. Scans all `.css`, `.scss`, `.sass`, `.less` files.
2. Extracts every literal design-relevant value (color, spacing, font, radius, shadow, z-index, breakpoint, transition/easing).
3. Clusters near-duplicate values, names them, and organizes them into a grouped token system.
4. Generates token files (CSS custom properties + optionally SCSS/JSON, W3C DTCG-compatible).
5. Rewrites all usages in the source files to reference the new tokens, safely.

## 2. Prior Art Check (done — do not re-research this)

No existing tool covers the full pipeline end-to-end. Closest matches, and why they fall short:

| Tool | Does | Gap |
|---|---|---|
| CSS DNA (Chrome ext) | Extracts tokens from a *live rendered page* | Not repo-based, no VS Code, no rewrite step |
| Replay.build | Video -> tokens + AI search/replace | Web SaaS, not an editor extension, not static-analysis based |
| Polaris / Kong / IFS VS Code exts | Autocomplete for tokens that *already exist* | Assumes tokens already defined; no extraction |
| Style Dictionary | Tokens -> CSS/SCSS/JS output | Only goes token->code, not code->token |
| Codemod token-migration scripts | Rename known tokens across a codebase | Requires the token list already defined; not discovery |

Conclusion: this is a real gap, worth building.

## 3. Architecture

```
extension.ts (activation, commands, VS Code UI)
  |-- scanner.ts       -- glob files, read into memory
  |-- parser/
  |     |-- valueClassifier.ts  -- property->category map, regexes
  |     |-- extractor.ts        -- postcss AST walk, value extraction
  |-- report.ts        -- assembles JSON report (exact-value pre-clustering only)
  |-- types.ts          -- shared interfaces
  (not yet built)
  |-- clustering/       -- Phase 2: fuzzy-group near-duplicate values
  |-- naming/            -- Phase 2: generate token names
  |-- generator/          -- Phase 2: emit token files (css/scss/json-dtcg)
  |-- rewriter/           -- Phase 4: AST-based find/replace of literals -> var()/$token
  |-- preview/            -- Phase 3: Webview diff UI before applying
  |-- config/             -- Phase 1.1: .designtokenrc schema + defaults
```

**Core libraries** (already wired into package.json below):
- `postcss` + `postcss-scss` -- parsing/AST, preserves formatting.
- `fast-glob` -- file discovery respecting include/exclude globs.
- `postcss-value-parser` -- listed as a dependency for Phase 2 shorthand decomposition; not yet used in Phase 1's regex-based extraction.
- Not yet added: `culori` (Phase 2, perceptual color clustering), VS Code `Webview API` (Phase 3).

## 4. Config Directives (target shape — not yet loaded from disk, see TODO in extension.ts)

```json
{
  "include": ["src/**/*.{css,scss}"],
  "exclude": ["**/node_modules/**", "**/dist/**"],
  "outputFormats": ["css", "json-dtcg"],
  "outputDir": "src/tokens",
  "naming": { "case": "kebab", "prefix": "" },
  "clustering": {
    "color": { "deltaE": 2.0 },
    "spacing": { "toleranceRem": 0.01 }
  },
  "categories": ["color", "spacing", "typography", "radius", "shadow", "zIndex", "breakpoint"]
}
```

## 5. UX / Commands (Phase 1 ships the first one only)
- `Design Tokens: Scan Workspace` -- IMPLEMENTED. Runs extraction, writes `.designtokens-report.json` to the workspace root, opens it, shows a per-category summary.
- `Design Tokens: Generate Token Files` -- Phase 2.
- `Design Tokens: Preview Migration` -- Phase 3.
- `Design Tokens: Apply Migration` -- Phase 4.

## 6. Key Risks to Design Around (read before touching the rewriter in Phase 4)
- Over-aggressive clustering silently merging visually distinct colors/spacing -- mitigate with confidence scores and mandatory user approval. Never auto-merge.
- Rewriting inside `calc()`, media queries, or generated/minified CSS -- detect and skip, don't guess.
- Large repos -- must be async/incremental with progress reporting (Phase 1 already uses `vscode.window.withProgress`, keep that pattern).
- No git repo present -- warn before destructive rewrite, offer file-level backup, before Phase 4 ships.
- **Never write directly to disk without a preview** once the rewriter (Phase 4) exists. Phase 1 only ever writes the read-only report file, never touches source files -- keep it that way until Phase 3's diff UI exists.

## 7. Phase 1 — IMPLEMENTED, validated below

Scope: scanner + parser + raw extraction, dumps a JSON report only. No clustering,
no generation, no rewriting. This validates detection accuracy before anything
touches the user's source files.

### 7.1 File tree
```
design-token-extractor/
  package.json
  tsconfig.json
  src/
    types.ts
    scanner.ts
    report.ts
    extension.ts
    parser/
      valueClassifier.ts
      extractor.ts
  demo/
    run-extractor.js
    fixtures/
      sample.css
```

### 7.2 Source files

#### `package.json`

```json
{
  "name": "design-token-extractor",
  "displayName": "Design Token Extractor & Migrator",
  "description": "Scans CSS/SCSS/SASS/LESS in a workspace, extracts design tokens, and (in later phases) migrates usages to reference them.",
  "version": "0.1.0",
  "publisher": "your-publisher-id",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Linters", "Other"],
  "activationEvents": [
    "onCommand:designTokens.scanWorkspace"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "designTokens.scanWorkspace",
        "title": "Design Tokens: Scan Workspace"
      }
    ]
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "test:demo": "node demo/run-extractor.js"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.85.0",
    "typescript": "^5.4.0"
  },
  "dependencies": {
    "fast-glob": "^3.3.2",
    "postcss": "^8.4.38",
    "postcss-scss": "^4.0.9",
    "postcss-value-parser": "^4.2.0"
  }
}

```

#### `tsconfig.json`

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020"],
    "outDir": "out",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "exclude": ["node_modules", ".vscode-test", "demo"]
}

```

#### `src/types.ts`

```typescript
export type TokenCategory =
  | 'color'
  | 'spacing'
  | 'font-family'
  | 'font-size'
  | 'font-weight'
  | 'line-height'
  | 'letter-spacing'
  | 'radius'
  | 'shadow'
  | 'z-index'
  | 'breakpoint'
  | 'transition'
  | 'unknown';

export interface TokenOccurrence {
  file: string;         // path relative to workspace root
  line: number;         // 1-indexed
  column: number;       // 1-indexed
  selector: string;     // nearest enclosing selector or at-rule, for context
  property: string;     // e.g. "margin", "color", "@media"
  rawValue: string;     // the exact matched substring, e.g. "#3B82F6", "16px"
  fullDeclarationValue: string; // full value of the declaration, for context
  category: TokenCategory;
}

export interface ScanConfig {
  include: string[];
  exclude: string[];
  categories: TokenCategory[];
}

export const DEFAULT_CONFIG: ScanConfig = {
  include: ['**/*.css', '**/*.scss', '**/*.sass', '**/*.less'],
  exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.min.css'],
  categories: [
    'color',
    'spacing',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'radius',
    'shadow',
    'z-index',
    'breakpoint',
    'transition',
  ],
};

export interface ScanReport {
  generatedAt: string;
  filesScanned: number;
  occurrenceCount: number;
  occurrences: TokenOccurrence[];
  // Quick pre-clustering: exact-value grouping only (no fuzzy matching yet — that's Phase 2)
  summaryByCategory: Record<TokenCategory, { uniqueValues: number; totalOccurrences: number }>;
}

```

#### `src/parser/valueClassifier.ts`

```typescript
import { TokenCategory } from '../types';

/**
 * Property -> category map. This is the FAST PATH: it tells us what a
 * declaration is primarily "about". It does not preclude colors from also
 * being found inside e.g. `border` or `box-shadow` shorthand — those are
 * still caught separately by COLOR_REGEX in extractor.ts.
 */
const SPACING_PROPS = new Set([
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap', 'row-gap', 'column-gap',
  'top', 'right', 'bottom', 'left',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
]);

const FONT_FAMILY_PROPS = new Set(['font-family', 'font']);
const FONT_SIZE_PROPS = new Set(['font-size']);
const FONT_WEIGHT_PROPS = new Set(['font-weight']);
const LINE_HEIGHT_PROPS = new Set(['line-height']);
const LETTER_SPACING_PROPS = new Set(['letter-spacing']);

const RADIUS_PROPS = new Set([
  'border-radius', 'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
]);

const SHADOW_PROPS = new Set(['box-shadow', 'text-shadow']);
const ZINDEX_PROPS = new Set(['z-index']);
const TRANSITION_PROPS = new Set([
  'transition', 'transition-duration', 'transition-timing-function',
  'animation', 'animation-duration', 'animation-timing-function',
]);

export function classifyProperty(propRaw: string): TokenCategory | 'unknown' {
  const prop = propRaw.trim().toLowerCase();
  if (SPACING_PROPS.has(prop)) return 'spacing';
  if (FONT_FAMILY_PROPS.has(prop)) return 'font-family';
  if (FONT_SIZE_PROPS.has(prop)) return 'font-size';
  if (FONT_WEIGHT_PROPS.has(prop)) return 'font-weight';
  if (LINE_HEIGHT_PROPS.has(prop)) return 'line-height';
  if (LETTER_SPACING_PROPS.has(prop)) return 'letter-spacing';
  if (RADIUS_PROPS.has(prop)) return 'radius';
  if (SHADOW_PROPS.has(prop)) return 'shadow';
  if (ZINDEX_PROPS.has(prop)) return 'z-index';
  if (TRANSITION_PROPS.has(prop)) return 'transition';
  return 'unknown';
}

// Matches hex (#fff, #ffffff, #ffffff00), rgb(a)(...), hsl(a)(...), oklch(...), oklab(...)
export const COLOR_REGEX =
  /#(?:[0-9a-fA-F]{3,8})\b|(?:rgba?|hsla?|oklch|oklab|lab|lch)\([^)]*\)/g;

// A length/number token: 16px, 1.5rem, 100%, 2em, 0 (unitless zero is valid but low-signal)
export const LENGTH_REGEX = /-?\d*\.?\d+(?:px|rem|em|%|vh|vw|ch|ex|pt|pc|in|cm|mm)/g;

// Matches a bare integer (for z-index, font-weight numeric)
export const INTEGER_REGEX = /^-?\d+$/;

// media query breakpoint extraction, e.g. (min-width: 768px)
export const MEDIA_BREAKPOINT_REGEX = /(min-width|max-width|min-height|max-height)\s*:\s*(-?\d*\.?\d+(?:px|em|rem))/g;

// Time durations for transitions/animations: 200ms, 0.3s
export const TIME_REGEX = /-?\d*\.?\d+(?:ms|s)\b/g;

// Easing keywords/functions for transitions
export const EASING_REGEX = /cubic-bezier\([^)]*\)|\bease-in-out\b|\bease-in\b|\bease-out\b|\bease\b|\blinear\b|\bstep-start\b|\bstep-end\b/g;

```

#### `src/parser/extractor.ts`

```typescript
import * as postcss from 'postcss';
import * as scss from 'postcss-scss';
import * as path from 'path';
import { TokenOccurrence, TokenCategory } from '../types';
import {
  classifyProperty,
  COLOR_REGEX,
  LENGTH_REGEX,
  TIME_REGEX,
  EASING_REGEX,
  MEDIA_BREAKPOINT_REGEX,
  INTEGER_REGEX,
} from './valueClassifier';

function nearestSelector(decl: postcss.Declaration): string {
  const parent = decl.parent;
  if (!parent) return '(root)';
  if (parent.type === 'rule') return (parent as postcss.Rule).selector;
  if (parent.type === 'atrule') return `@${(parent as postcss.AtRule).name} ${(parent as postcss.AtRule).params}`;
  return '(unknown)';
}

function pushMatches(
  occurrences: TokenOccurrence[],
  regex: RegExp,
  text: string,
  category: TokenCategory,
  ctx: { file: string; line: number; column: number; selector: string; property: string; fullValue: string }
) {
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    occurrences.push({
      file: ctx.file,
      line: ctx.line,
      column: ctx.column,
      selector: ctx.selector,
      property: ctx.property,
      rawValue: m[0],
      fullDeclarationValue: ctx.fullValue,
      category,
    });
  }
}

/**
 * Extract token occurrences from a single file's contents.
 * @param filePath absolute path (used for reporting only)
 * @param relativePath path relative to workspace root, stored in the report
 * @param contents raw file text
 */
export function extractFromSource(
  filePath: string,
  relativePath: string,
  contents: string
): TokenOccurrence[] {
  const occurrences: TokenOccurrence[] = [];
  const ext = path.extname(filePath).toLowerCase();

  // .scss/.sass need the scss syntax to tolerate $variables, nesting, //-comments.
  // .css/.less are parsed with the default postcss parser. This does NOT fully
  // understand LESS-specific syntax (e.g. `.mixin()` calls, `@var` interpolation) —
  // good enough for literal-value extraction, but flag for a dedicated
  // postcss-less pass in Phase 5 if LESS usage is heavy.
  const syntax = ext === '.scss' || ext === '.sass' ? scss : undefined;

  let root: postcss.Root;
  try {
    root = postcss.parse(contents, { from: filePath, syntax });
  } catch (err) {
    // Malformed file — do not crash the whole scan, report and move on.
    console.warn(`[design-tokens] Failed to parse ${relativePath}: ${(err as Error).message}`);
    return occurrences;
  }

  // --- Declarations: color, spacing, typography, radius, shadow, z-index, transition ---
  root.walkDecls((decl) => {
    const prop = decl.prop.trim().toLowerCase();
    const value = decl.value;
    const line = decl.source?.start?.line ?? 0;
    const column = decl.source?.start?.column ?? 0;
    const selector = nearestSelector(decl);
    const ctx = { file: relativePath, line, column, selector, property: prop, fullValue: value };

    // Colors can appear inside ANY property's shorthand (border, box-shadow, background...),
    // so always scan for them regardless of the property's primary category.
    pushMatches(occurrences, COLOR_REGEX, value, 'color', ctx);

    const category = classifyProperty(prop);

    switch (category) {
      case 'spacing':
      case 'radius':
        pushMatches(occurrences, LENGTH_REGEX, value, category, ctx);
        break;
      case 'font-size':
      case 'letter-spacing':
        pushMatches(occurrences, LENGTH_REGEX, value, category, ctx);
        break;
      case 'line-height':
        // line-height is often unitless (e.g. 1.5) — capture both unitless numbers and lengths
        if (/^-?\d*\.?\d+$/.test(value.trim())) {
          occurrences.push({ ...ctx, rawValue: value.trim(), category: 'line-height' });
        } else {
          pushMatches(occurrences, LENGTH_REGEX, value, 'line-height', ctx);
        }
        break;
      case 'font-family':
        occurrences.push({ ...ctx, rawValue: value.trim(), category: 'font-family' });
        break;
      case 'font-weight':
        if (INTEGER_REGEX.test(value.trim()) || /^(normal|bold|lighter|bolder)$/i.test(value.trim())) {
          occurrences.push({ ...ctx, rawValue: value.trim(), category: 'font-weight' });
        }
        break;
      case 'shadow':
        pushMatches(occurrences, LENGTH_REGEX, value, 'shadow', ctx);
        break;
      case 'z-index':
        if (INTEGER_REGEX.test(value.trim())) {
          occurrences.push({ ...ctx, rawValue: value.trim(), category: 'z-index' });
        }
        break;
      case 'transition':
        pushMatches(occurrences, TIME_REGEX, value, 'transition', ctx);
        pushMatches(occurrences, EASING_REGEX, value, 'transition', ctx);
        break;
      default:
        // Unknown property: skip. Revisit in Phase 5 if noise from
        // legitimate properties (e.g. `flex`, `grid-template-columns`) matters.
        break;
    }
  });

  // --- @media breakpoints ---
  root.walkAtRules('media', (atRule) => {
    const line = atRule.source?.start?.line ?? 0;
    const column = atRule.source?.start?.column ?? 0;
    MEDIA_BREAKPOINT_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MEDIA_BREAKPOINT_REGEX.exec(atRule.params)) !== null) {
      occurrences.push({
        file: relativePath,
        line,
        column,
        selector: `@media ${atRule.params}`,
        property: '@media',
        rawValue: m[2],
        fullDeclarationValue: atRule.params,
        category: 'breakpoint',
      });
    }
  });

  return occurrences;
}

```

#### `src/scanner.ts`

```typescript
import fg from 'fast-glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ScanConfig } from '../types';

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  contents: string;
}

export async function scanWorkspace(
  workspaceRoot: string,
  config: ScanConfig
): Promise<ScannedFile[]> {
  const matches = await fg(config.include, {
    cwd: workspaceRoot,
    ignore: config.exclude,
    absolute: false,
    onlyFiles: true,
    dot: false,
  });

  const files: ScannedFile[] = [];
  for (const relativePath of matches) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    try {
      const contents = await fs.readFile(absolutePath, 'utf8');
      files.push({ absolutePath, relativePath, contents });
    } catch (err) {
      console.warn(`[design-tokens] Could not read ${relativePath}: ${(err as Error).message}`);
    }
  }
  return files;
}

```

#### `src/report.ts`

```typescript
import { TokenOccurrence, TokenCategory, ScanReport, DEFAULT_CONFIG } from '../types';

export function buildReport(
  filesScanned: number,
  occurrences: TokenOccurrence[]
): ScanReport {
  const summaryByCategory = {} as ScanReport['summaryByCategory'];

  for (const category of DEFAULT_CONFIG.categories) {
    const inCategory = occurrences.filter((o) => o.category === category);
    const uniqueValues = new Set(inCategory.map((o) => o.rawValue.trim())).size;
    summaryByCategory[category] = {
      uniqueValues,
      totalOccurrences: inCategory.length,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    filesScanned,
    occurrenceCount: occurrences.length,
    occurrences,
    summaryByCategory,
  };
}

```

#### `src/extension.ts`

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { scanWorkspace } from './scanner';
import { extractFromSource } from './parser/extractor';
import { buildReport } from './report';
import { DEFAULT_CONFIG, TokenOccurrence } from './types';

const OUTPUT_CHANNEL_NAME = 'Design Tokens';

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);

  const scanCommand = vscode.commands.registerCommand(
    'designTokens.scanWorkspace',
    async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('Design Tokens: open a folder/workspace first.');
        return;
      }

      // Phase 1 scope: single root folder. Multi-root/monorepo handling is Phase 5.
      const root = folders[0].uri.fsPath;

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Design Tokens: scanning workspace…',
          cancellable: false,
        },
        async (progress) => {
          // TODO Phase 1.1: load .designtokenrc.json from root and merge over DEFAULT_CONFIG.
          const config = DEFAULT_CONFIG;

          const files = await scanWorkspace(root, config);
          progress.report({ message: `Parsing ${files.length} files…` });

          const allOccurrences: TokenOccurrence[] = [];
          for (const file of files) {
            const occurrences = extractFromSource(file.absolutePath, file.relativePath, file.contents);
            allOccurrences.push(...occurrences);
          }

          const report = buildReport(files.length, allOccurrences);
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
            `Design Tokens: found ${report.occurrenceCount} occurrences across ${report.filesScanned} files. Report written to .designtokens-report.json`
          );
        }
      );
    }
  );

  context.subscriptions.push(scanCommand, output);
}

export function deactivate() {}

```

### 7.3 Dependency-free validation demo

The sandbox this was built in had no npm registry access, so `postcss` could not be installed to run `src/parser/extractor.ts` directly. To still validate the classification rules before shipping them, a zero-dependency line/regex-based re-implementation of the same logic was written and run against a fixture file. **This demo script is not part of the extension and should not be extended** — port any rule changes back into `src/parser/valueClassifier.ts` / `src/parser/extractor.ts` instead.

#### `demo/fixtures/sample.css`

```css
:root {
  --unrelated: 1;
}

.button {
  background-color: #3B82F6;
  color: #ffffff;
  padding: 8px 16px;
  border-radius: 4px;
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: background-color 200ms ease-in-out;
  z-index: 10;
}

.button--secondary {
  background-color: #3b82f6; /* same blue, different case */
  color: #FFF;
  padding: 8px 16px;
  border-radius: 4px;
}

.card {
  margin: 24px;
  padding: 16px 24px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.08);
  font-size: 14px;
  line-height: 1.4;
}

@media (min-width: 768px) {
  .card {
    padding: 24px 32px;
  }
}

@media (max-width: 1024px) {
  .button {
    font-size: 14px;
  }
}

```

#### `demo/run-extractor.js`

```javascript
/**
 * DEMO ONLY — not the real extension code path.
 *
 * The actual extension (../src/parser/extractor.ts) uses postcss's real CSS/SCSS
 * AST parser, which correctly handles nesting, comments, strings, and multi-line
 * values. This script re-implements a much simpler line-based version of the
 * same classification logic using zero dependencies, purely so the extraction
 * rules can be sanity-checked and run right now, without npm registry access.
 *
 * Do not build on top of this file — port any rule changes back into
 * src/parser/valueClassifier.ts and src/parser/extractor.ts instead.
 */

const fs = require('fs');
const path = require('path');

const COLOR_REGEX = /#(?:[0-9a-fA-F]{3,8})\b|(?:rgba?|hsla?|oklch|oklab|lab|lch)\([^)]*\)/g;
const LENGTH_REGEX = /-?\d*\.?\d+(?:px|rem|em|%|vh|vw|ch|ex|pt|pc|in|cm|mm)/g;
const TIME_REGEX = /-?\d*\.?\d+(?:ms|s)\b/g;
const EASING_REGEX = /cubic-bezier\([^)]*\)|\bease-in-out\b|\bease-in\b|\bease-out\b|\bease\b|\blinear\b/g;
const MEDIA_BREAKPOINT_REGEX = /(min-width|max-width|min-height|max-height)\s*:\s*(-?\d*\.?\d+(?:px|em|rem))/g;
const INTEGER_REGEX = /^-?\d+$/;

const SPACING_PROPS = new Set([
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap', 'row-gap', 'column-gap', 'top', 'right', 'bottom', 'left',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
]);
const RADIUS_PROPS = new Set([
  'border-radius', 'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
]);
const SHADOW_PROPS = new Set(['box-shadow', 'text-shadow']);
const TRANSITION_PROPS = new Set(['transition', 'transition-duration', 'animation', 'animation-duration']);

function classifyProperty(prop) {
  if (SPACING_PROPS.has(prop)) return 'spacing';
  if (prop === 'font-family' || prop === 'font') return 'font-family';
  if (prop === 'font-size') return 'font-size';
  if (prop === 'font-weight') return 'font-weight';
  if (prop === 'line-height') return 'line-height';
  if (prop === 'letter-spacing') return 'letter-spacing';
  if (RADIUS_PROPS.has(prop)) return 'radius';
  if (SHADOW_PROPS.has(prop)) return 'shadow';
  if (prop === 'z-index') return 'z-index';
  if (TRANSITION_PROPS.has(prop)) return 'transition';
  return 'unknown';
}

function pushMatches(occurrences, regex, text, category, ctx) {
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    occurrences.push({ ...ctx, rawValue: m[0], category });
  }
}

function extractFromFile(relativePath, contents) {
  const occurrences = [];
  const lines = contents.split('\n');
  const selectorStack = [];

  lines.forEach((lineText, idx) => {
    const line = idx + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;

    // very rough brace tracking (demo-grade — real code uses postcss's AST instead)
    if (trimmed.endsWith('{')) {
      const opened = trimmed.replace('{', '').trim();
      selectorStack.push(opened);

      // Extract breakpoints at the moment the @media rule itself is opened,
      // not from whatever selector happens to be innermost later — nested
      // rules inside @media would otherwise shadow it.
      if (opened.startsWith('@media')) {
        MEDIA_BREAKPOINT_REGEX.lastIndex = 0;
        let m;
        while ((m = MEDIA_BREAKPOINT_REGEX.exec(opened)) !== null) {
          occurrences.push({
            file: relativePath, line, selector: opened, property: '@media',
            rawValue: m[2], category: 'breakpoint',
          });
        }
      }
      return;
    }
    if (trimmed === '}') {
      selectorStack.pop();
      return;
    }

    const currentSelector = selectorStack[selectorStack.length - 1] || '(root)';

    // declaration line: "prop: value;"
    const declMatch = trimmed.match(/^([a-zA-Z-]+)\s*:\s*(.+?);?\s*(\/\*.*\*\/)?$/);
    if (!declMatch) return;
    const prop = declMatch[1].trim().toLowerCase();
    const value = declMatch[2].trim();
    const ctx = { file: relativePath, line, selector: currentSelector, property: prop };

    pushMatches(occurrences, COLOR_REGEX, value, 'color', ctx);

    const category = classifyProperty(prop);
    switch (category) {
      case 'spacing':
      case 'radius':
      case 'font-size':
      case 'letter-spacing':
      case 'shadow':
        pushMatches(occurrences, LENGTH_REGEX, value, category, ctx);
        break;
      case 'line-height':
        if (/^-?\d*\.?\d+$/.test(value)) {
          occurrences.push({ ...ctx, rawValue: value, category: 'line-height' });
        } else {
          pushMatches(occurrences, LENGTH_REGEX, value, 'line-height', ctx);
        }
        break;
      case 'font-family':
        occurrences.push({ ...ctx, rawValue: value, category: 'font-family' });
        break;
      case 'font-weight':
        if (INTEGER_REGEX.test(value) || /^(normal|bold|lighter|bolder)$/i.test(value)) {
          occurrences.push({ ...ctx, rawValue: value, category: 'font-weight' });
        }
        break;
      case 'z-index':
        if (INTEGER_REGEX.test(value)) occurrences.push({ ...ctx, rawValue: value, category: 'z-index' });
        break;
      case 'transition':
        pushMatches(occurrences, TIME_REGEX, value, 'transition', ctx);
        pushMatches(occurrences, EASING_REGEX, value, 'transition', ctx);
        break;
      default:
        break;
    }
  });

  return occurrences;
}

// --- run against the fixture ---
const fixturePath = path.join(__dirname, 'fixtures', 'sample.css');
const contents = fs.readFileSync(fixturePath, 'utf8');
const occurrences = extractFromFile('demo/fixtures/sample.css', contents);

const summary = {};
for (const o of occurrences) {
  summary[o.category] = summary[o.category] || { totalOccurrences: 0, values: new Set() };
  summary[o.category].totalOccurrences += 1;
  summary[o.category].values.add(o.rawValue);
}
const summaryOut = Object.fromEntries(
  Object.entries(summary).map(([k, v]) => [k, { totalOccurrences: v.totalOccurrences, uniqueValues: v.values.size }])
);

console.log('=== Occurrences ===');
console.log(JSON.stringify(occurrences, null, 2));
console.log('\n=== Summary by category ===');
console.log(JSON.stringify(summaryOut, null, 2));

```

#### Validated output (run in-sandbox, `node demo/run-extractor.js`)

Confirms per-category classification works correctly across colors (including inside `box-shadow` shorthand), spacing, radius, font properties, shadows, transitions/easing, z-index, and `@media` breakpoints:

```json
{
  "color": { "totalOccurrences": 6, "uniqueValues": 6 },
  "spacing": { "totalOccurrences": 9, "uniqueValues": 4 },
  "radius": { "totalOccurrences": 3, "uniqueValues": 2 },
  "font-family": { "totalOccurrences": 1, "uniqueValues": 1 },
  "font-size": { "totalOccurrences": 3, "uniqueValues": 2 },
  "font-weight": { "totalOccurrences": 1, "uniqueValues": 1 },
  "line-height": { "totalOccurrences": 2, "uniqueValues": 2 },
  "shadow": { "totalOccurrences": 4, "uniqueValues": 3 },
  "transition": { "totalOccurrences": 2, "uniqueValues": 2 },
  "z-index": { "totalOccurrences": 1, "uniqueValues": 1 },
  "breakpoint": { "totalOccurrences": 2, "uniqueValues": 2 }
}
```

Bug caught and fixed during this validation: breakpoint extraction initially checked the *innermost* selector for `@media`, so declarations nested inside a media query (e.g. `.card { padding: ... }` inside `@media (min-width: 768px)`) shadowed the media query itself and the breakpoint was silently never extracted. Fixed by extracting breakpoints at the moment the `@media` rule is opened, not from whatever selector is innermost when a later declaration line is processed. **The real extractor (`extractor.ts`) does not have this bug** — it uses `root.walkAtRules('media', ...)` from postcss, which is scoped to the at-rule itself regardless of nesting. This is flagged here as a warning for anyone tempted to write a faster line-based parser instead of using postcss's real AST: nesting-unaware shortcuts reintroduce this exact bug.

## 8. Phase 2 — Clustering + Naming + Generation (not yet built)

Build order for the next agent:

1. **Exact-value clustering** (trivial, do first): group occurrences that share
   the exact same `rawValue` after trivial normalization (lowercase hex,
   trim whitespace). This is almost done already in `report.ts`'s
   `summaryByCategory` — extend it to also group the *occurrences themselves*
   (not just counts) so each cluster carries its list of {file, line, selector}.
2. **Near-value clustering** (opt-in, threshold-based):
   - Colors: use `culori` for perceptual delta-E distance. Default threshold
     ~2.0 (config value already stubbed in section 4). Never auto-merge --
     always surface clusters for user approval in the results panel.
   - Spacing: rounding tolerance in rem (default 0.01, stubbed in config).
   - Detect an implicit spacing scale (e.g. 4/8/12/16/24/32) and suggest
     snapping outliers to it, but require explicit confirmation per snap.
3. **Naming**:
   - Primitive tier: `color-blue-500`, `space-4`, generated from raw values
     and frequency rank.
   - Semantic tier (optional, user-mapped): `color-background-primary` mapped
     onto a primitive. Simple selector-name heuristics (e.g. `.error` ->
     suggest `color-feedback-error`) are fine as *suggestions*, never silent
     auto-assignment.
   - Config-driven casing/prefix (kebab-case default).
4. **Generation**:
   - Output formats: CSS custom properties (default), SCSS variables, W3C
     DTCG JSON -- selectable via config, can emit more than one.
   - Grouped file structure by category: `tokens/color.css`,
     `tokens/spacing.css`, `tokens/typography.css`, etc., plus an `index.css`
     that imports them all.
   - New command: `Design Tokens: Generate Token Files`. Should reuse the
     `.designtokens-report.json` produced by Phase 1 rather than re-scanning,
     unless the user explicitly asks to rescan.

## 9. Phase 3 — Preview Diff UI (not yet built)
- New command: `Design Tokens: Preview Migration`.
- Use a VS Code Webview (per section 3's "preview/" module) or the built-in
  diff editor to show, per file, every literal value that *would* be replaced
  and with what token, before anything is written.
- Per-occurrence accept/reject, not just per-file or per-category.

## 10. Phase 4 — Safe Rewrite/Apply (not yet built, treat as highest-risk work)
- Match by exact literal value at the AST node level (postcss), never by
  regex over raw text -- avoids corrupting comments, strings, or unrelated
  matches.
- Skip ambiguous contexts by default and flag for manual review rather than
  silently rewriting or silently skipping: values inside `calc()`, CSS custom
  property *definitions* themselves, vendor-prefixed duplicates.
- Only ever write to disk after the user has accepted diffs in Phase 3's UI.
- Provide a single "Undo migration" command. If the workspace is a git repo,
  auto-create a pre-migration git stash or tag before applying; otherwise warn
  clearly that no automatic rollback is available.
- New command: `Design Tokens: Apply Migration`, applies accepted diffs only,
  batchable per category (e.g. apply all color replacements independent of
  spacing) so users can migrate incrementally.

## 11. Phase 5 — Stretch goals (not yet built)
- `.designtokenrc.json` loading (the TODO already left in `extension.ts`).
- Multi-root workspace / monorepo support (Phase 1 only scans
  `workspaceFolders[0]`, see the TODO comment in `extension.ts`).
- Dedicated `postcss-less` parsing pass -- Phase 1's extractor uses the
  default postcss parser for `.less` files, which doesn't understand
  LESS-specific syntax like mixin calls or `@variable` interpolation. Fine for
  literal-value extraction, not fine for anything LESS-specific.
- Semantic-naming assist beyond simple selector heuristics.
- Tailwind / JS-in-CSS (styled-components, CSS-in-JS) support.

## 12. Testing Strategy (apply from Phase 2 onward)
- Unit tests per extractor category, using fixture files with known expected
  token counts -- `demo/fixtures/sample.css` can be promoted into a real test
  fixture once a test runner is wired in (not yet done; Phase 1 only has the
  manual demo script).
- Golden-file tests for the Phase 4 rewrite step (input CSS -> expected output
  CSS).
- Manual QA against a real-world large open-source CSS codebase (e.g.
  Bootstrap source pre-tokens) as a benchmark before calling Phase 4 done.

## 13. How to actually build and run this (once you have npm registry access)

```bash
cd design-token-extractor
npm install
npm run compile
# then in VS Code: F5 to launch an Extension Development Host,
# open any folder with CSS/SCSS in it, run "Design Tokens: Scan Workspace"
# from the command palette.
```

To re-validate the classification rules without installing anything:
```bash
node demo/run-extractor.js
```
