# Design Token Extractor & Migrator

Find hardcoded design values in CSS, SCSS, SASS, LESS, Vue, HTML, and JS/TS (including Tailwind arbitrary values and CSS-in-JS), turn them into a token system, and replace those literals with token references — after you preview and accept each change.

Works in **VS Code** and **Cursor**. Same extension ID: `bobrowsse-tech.design-token-extractor-migrator`.

## Install

- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=bobrowsse-tech.design-token-extractor-migrator)
- [Open VSX](https://open-vsx.org/extension/bobrowsse-tech/design-token-extractor-migrator) (Cursor, VSCodium, and other Open VSX clients)
- Command Palette → **Extensions: Install from VSIX…** if you downloaded a release from [GitHub](https://github.com/bobrowsse-tech/design-token-extractor/releases)

Open a folder (or a multi-root workspace). The extension activates for CSS, SCSS, SASS, LESS, Vue, HTML, JavaScript, and TypeScript.

## Typical workflow

Run these from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).

### 1. Scan Workspace

**Design Tokens: Scan Workspace**

Walks every workspace folder (or the globs in `.designtokenrc.json`) and writes `.designtokens-report.json` in each folder. The **Design Tokens** output channel shows file and category counts. Unchanged files are skipped via `.designtokens-scan-cache.json`. Nothing else is written.

Use this when you want a report only — CI, a first look, or a folder you cannot write tokens into.

### 2. Generate Token Files

**Design Tokens: Generate Token Files**

Scans, clusters similar values, assigns stable names, and writes a token system. **Your source CSS is not changed.**

Default output directory: `design-tokens/`

| File | What it is |
| --- | --- |
| `color.css`, `spacing.css`, … | CSS custom properties (`:root { --token-name: … }`). Typography composites emit a `font` shorthand when `font-size` and `font-family` are both present. |
| `index.css` | Imports every generated CSS category file |
| `_color.scss`, `_spacing.scss`, … | SCSS variables |
| `tokens.dtcg.json` | [W3C Design Tokens](https://www.designtokens.org/) 2025.10 (color objects, typed dimension/duration, composites) |
| `tokens.tokensstudio.json` | [Tokens Studio](https://tokens.studio/) |
| `tokens.lock.json` | Stable ids and names across rescans — commit this |
| `README.md` | Generated inventory, contrast flags, light/dark pairs, probable typos, color reference matches |

It also writes `.stylelintrc.json` at the workspace root so Stylelint can warn on leftover literals.

Names stay stable because of `tokens.lock.json`. A later generate adds new tokens and keeps existing names.

### 3. Preview Migration

**Design Tokens: Preview Migration**

Opens a side panel of proposed replacements, grouped by file:

- **Safe** items are exact values plus **assisted** unique substrings in shorthand, `calc()`, media queries, and unique colors inside multi-layer shadows.
- **Flagged** items stay manual: ambiguous repeats (`margin: 8px 8px`), custom-property definitions, vendor prefixes, and assembled typography composites.

Filter by category (for example apply only colors). Accept or reject each safe row, or bulk accept/reject the visible rows. Nothing is written until you apply.

The plan is saved as `.designtokens-migration.json` so you can close the panel and apply later.

### 4. Apply Migration

**Design Tokens: Apply Migration**

Writes **only** the safe replacements you accepted. You get a confirmation with file and replacement counts.

Before writing, the extension:

- snapshots the files it will touch into a local backup
- tags `design-tokens-pre-migration-…` if the folder is a git repo

If the folder is not a git repo, you must confirm that a local backup is enough.

### 5. Undo Last Migration

**Design Tokens: Undo Last Migration**

Restores the last backup from this workspace — the last Apply **or** the last CodeLens replace-in-file.

Ctrl/Cmd+Z also undoes a CodeLens replace because that action writes per-declaration edits, not a whole-file swap.

**Design Tokens: Undo From History** lists every snapshot under `.designtokens-backup/` so you can restore an older apply. Prefer git if you need states from outside this tool.

### 6. Rename Token

**Design Tokens: Rename Token**

Picks a lockfile entry, writes the new name through `tokens.lock.json`, rewrites matching `var(--old-name)` / `$old-name` in source files, then regenerates token files. Generated token files also get a **Rename --name** CodeLens.

### 7. Review Clusters

**Design Tokens: Review Clusters**

Opens a panel for every fuzzy-match cluster (`requiresApproval`) and every color that closely matches Tailwind or a CSS named color. You can **Merge into one token**, **Keep separate**, or **Rename**. Decisions are stored on `tokens.lock.json` (`resolution.mergedWith` / `renamedFrom` / `keptSeparateFrom`) so the next scan does not ask again.

If you just ran Generate or Preview, the panel reuses that pipeline result and does not rescan.

### 8. Map Semantic Alias

**Design Tokens: Map Semantic Alias**

Picks a primitive lockfile token and stores a semantic role on `tokens.lock.json` (`semanticAliases`). The next generate emits `--role: var(--primitive)` next to the primitive.

## CodeLens (in-file)

After a Scan or Generate, a value that appears more than once in this file **or** across the workspace gets a CodeLens. The title uses the workspace count when it is larger:

`N other place(s) in this workspace use "#1a1a2e" — Replace with token`

Click it to rewrite the safe and unique-substring occurrences in the current file only (one `WorkspaceEdit` per declaration value). Workspace-wide writes go through Preview / Apply. You will be warned first if the folder is not a git repo or this file already has uncommitted/unsaved changes. After it succeeds, the confirmation tells you how to undo (Ctrl/Cmd+Z or **Undo Last Migration**).

If you have not generated tokens yet, you will be warned that the name is provisional. Generate first when you want the same name across the whole workspace.

Turn CodeLens off with **Design Tokens: Code Lens: Enabled** in Settings (`designTokens.codeLens.enabled`). The setting applies immediately — no reload.

## What gets extracted

| Category | Examples |
| --- | --- |
| color | `#1a1a2e`, `rgb()`, `hsl()`, `oklch()`, `oklab()`, `lab()`, `lch()`, `hwb()`, `color(srgb …)` / `color(display-p3 …)` |
| spacing | `8px`, `1rem`, `border-width`, `flex-basis` |
| font-family, font-size, font-weight, line-height, letter-spacing | type scale |
| typography | composite of 2+ type properties on the same declaration block (media-query overrides stay separate) |
| radius | `4px`, `999px` |
| shadow | whole `box-shadow` / `text-shadow` (single layer) |
| border | `border` / `border-*` shorthand (`width`, `style`, `color`) |
| opacity | `0.9`, `fill-opacity`, `stroke-opacity` |
| z-index | stacking |
| breakpoint | media-query widths (flagged for manual review) |
| transition | whole `transition` shorthand, or duration / easing longhands |

Also extracted: Tailwind arbitrary values in `class` / `className`, CSS-in-JS tagged templates, Vue `<style>` blocks, HTML inline styles, and lengths/times on unknown properties (`flex`, `grid-template-columns`). Keyword-only values are skipped.

Default scan: `**/*.{css,scss,sass,less,vue,html,htm,js,jsx,ts,tsx}`, excluding `node_modules`, `dist`, `build`, and `*.min.css`.

## Configuration

Three layers, most specific wins: `.designtokenrc.json` (project) > VS Code workspace settings > VS Code user settings > built-in defaults.

Personal defaults live under **Settings → Design Tokens** (`designTokens.include`, `exclude`, `outputDir`, `naming.*`, `clustering.colorDeltaE`, `clustering.spacingToleranceRem`, `theme.darkMarkers`, `codeLens.enabled`).

Project config is optional. Copy this to `.designtokenrc.json` in the workspace root. The file has JSON Schema autocomplete in the editor. If it is missing, editor settings and then the defaults below are used.

```json
{
  "include": [
    "**/*.css", "**/*.scss", "**/*.sass", "**/*.less",
    "**/*.vue", "**/*.html", "**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"
  ],
  "exclude": ["**/node_modules/**", "**/dist/**", "**/build/**", "**/*.min.css"],
  "outputDir": "design-tokens",
  "outputFormats": ["css", "scss", "json-dtcg", "tokens-studio"],
  "naming": { "case": "kebab", "prefix": "" },
  "theme": { "darkMarkers": [".dark", ".theme-dark", "[data-theme=dark]", "prefers-color-scheme: dark"] },
  "clustering": {
    "color": { "deltaE": 2.0 },
    "spacing": { "toleranceRem": 0.01 }
  },
  "categories": [
    "color",
    "spacing",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "letter-spacing",
    "radius",
    "shadow",
    "z-index",
    "breakpoint",
    "transition",
    "opacity",
    "border",
    "typography"
  ]
}
```

- **include / exclude** — globs relative to the workspace root
- **outputDir** — where generated token files go
- **outputFormats** — any of `css`, `scss`, `json-dtcg`, `tokens-studio`
- **naming.case** — `kebab`, `camel`, `pascal`, or `snake`
- **naming.prefix** — prepended to every token name (for example `brand`)
- **theme.darkMarkers** — selector fragments that mark a dark-theme variant
- **clustering** — how close two colors or spacings must be before they are *flagged* as similar. Close values are **never auto-merged**; decide in **Review Clusters**

## Safety rules

- Generate never rewrites source CSS
- Apply writes only accepted safe / assisted replacements
- Fuzzy / near-matches are never applied automatically
- Ambiguous repeats, custom-property definitions, vendor prefixes, and assembled typography composites stay flagged
- **Undo Last Migration** restores the last local backup; **Undo From History** lists older snapshots
- Custom-property and LESS `@variable` *definitions* are not extracted as new literals
- Contrast pairs same-selector, ancestor, inherited, and document backgrounds; semi-transparent colors are composited. This is still a selector heuristic, not a full cascade engine
- Theme markers are configurable; pairs with more than one candidate after marker-stripping are marked low-confidence
- `z-index: 9999` is treated as an intentional escape hatch, not a typo

## CLI (same engine)

For CI or a pre-commit hook, the same core ships as a CLI:

```bash
npx @design-token-extractor/cli scan --dir .
npx @design-token-extractor/cli generate --dir .
npx @design-token-extractor/cli check --dir .
npx @design-token-extractor/cli preview --dir . --category color
npx @design-token-extractor/cli apply --dir . --yes
```

`check` exits `1` when a new hardcoded value appears that is not already in `tokens.lock.json`. `apply` refuses to write source files without `--yes`.

## Requirements

- VS Code 1.96 or later, or Cursor
- Node.js 22 or later if you use the CLI

## License

MIT. Source: [github.com/bobrowsse-tech/design-token-extractor](https://github.com/bobrowsse-tech/design-token-extractor).
