# Design Token Extractor & Migrator

Find hardcoded design values in CSS, SCSS, SASS, and LESS, turn them into a token system, and replace those literals with token references — after you preview and accept each change.

Works in **VS Code** and **Cursor**. Same extension ID: `bobrowsse-tech.design-token-extractor-migrator`.

## Install

- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=bobrowsse-tech.design-token-extractor-migrator)
- [Open VSX](https://open-vsx.org/extension/bobrowsse-tech/design-token-extractor-migrator) (Cursor, VSCodium, and other Open VSX clients)
- Command Palette → **Extensions: Install from VSIX…** if you downloaded a release from [GitHub](https://github.com/bobrowsse-tech/design-token-extractor/releases)

Open a folder that contains stylesheets. The extension activates for CSS, SCSS, SASS, and LESS.

## Typical workflow

Run these from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).

### 1. Scan Workspace

**Design Tokens: Scan Workspace**

Walks the workspace (or the globs in `.designtokenrc.json`) and writes `.designtokens-report.json` at the workspace root. The **Design Tokens** output channel shows file and category counts. Nothing else is written.

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
| `README.md` | Generated inventory, contrast flags, light/dark pairs |

It also writes `.stylelintrc.json` at the workspace root so Stylelint can warn on leftover literals.

Names stay stable because of `tokens.lock.json`. A later generate adds new tokens and keeps existing names.

### 3. Preview Migration

**Design Tokens: Preview Migration**

Opens a side panel of proposed replacements, grouped by file:

- **Safe** items are exact, simple values the rewriter can swap (for example `color: #1a1a2e` → `color: var(--color-navy-900)`), including a whole `box-shadow` / `border` / `transition` when it parsed as a single composite.
- **Flagged** items stay manual: shorthand (`margin: 8px 16px`), `calc()`, `var()`, custom-property definitions, vendor prefixes, breakpoints, multi-layer shadows, and assembled typography composites.

Accept or reject each safe row (or use bulk accept/reject). Nothing is written until you apply.

The plan is saved as `.designtokens-migration.json` so you can close the panel and apply later.

### 4. Apply Migration

**Design Tokens: Apply Migration**

Writes **only** the safe replacements you accepted. You get a confirmation with file and replacement counts.

Before writing, the extension:

- snapshots the files it will touch into a local backup
- tags `design-tokens-pre-migration-…` if the folder is a git repo

If the folder is not a git repo, you must confirm that a local backup is enough.

### 5. Undo Migration

**Design Tokens: Undo Migration**

Restores the last backup from this workspace. That is the last Apply, not an infinite history. Prefer git if you need older states.

## CodeLens (in-file)

In a CSS/SCSS/SASS/LESS editor, a value that appears more than once **in that file** gets a CodeLens:

`N other place(s) in this file use "#1a1a2e" — Replace with token`

Click it to rewrite the safe occurrences in the current file only.

If you have not generated tokens yet, you will be warned that the name is provisional. Generate first when you want the same name across the whole workspace.

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

Default scan: `**/*.{css,scss,sass,less}`, excluding `node_modules`, `dist`, `build`, and `*.min.css`.

## Configuration

Optional. Copy this to `.designtokenrc.json` in the workspace root. If the file is missing, the defaults below are used.

```json
{
  "include": ["**/*.css", "**/*.scss", "**/*.sass", "**/*.less"],
  "exclude": ["**/node_modules/**", "**/dist/**", "**/build/**", "**/*.min.css"],
  "outputDir": "design-tokens",
  "outputFormats": ["css", "scss", "json-dtcg", "tokens-studio"],
  "naming": { "case": "kebab", "prefix": "" },
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
- **naming.prefix** — prepended to every token name (for example `brand`)
- **clustering** — how close two colors or spacings must be before they are *flagged* as similar. Close values are **never auto-merged**; you decide in preview

## Safety rules

- Generate never rewrites source CSS
- Apply writes only accepted, safe AST replacements
- Fuzzy / near-matches are never applied automatically
- Shorthand, `calc()`, `var()`, `@property` / custom-property definitions, vendor prefixes, breakpoints, and multi-layer shadows are flagged
- Undo restores the last local backup only

## CLI (same engine)

For CI or a pre-commit hook, the same core ships as a CLI:

```bash
npx @design-token-extractor/cli scan --dir .
npx @design-token-extractor/cli generate --dir .
npx @design-token-extractor/cli check --dir .
```

`check` exits `1` when a new hardcoded value appears that is not already in `tokens.lock.json`.

## Requirements

- VS Code 1.96 or later, or Cursor
- Node.js 22 or later if you use the CLI

## License

MIT. Source: [github.com/bobrowsse-tech/design-token-extractor](https://github.com/bobrowsse-tech/design-token-extractor).
