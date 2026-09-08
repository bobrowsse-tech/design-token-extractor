# Design Token Extractor & Migrator

A VS Code / Cursor extension and CLI that finds hardcoded design values, turns them into a token system, and replaces those literals with token references — after you preview and accept each change.

It scans **CSS, SCSS, SASS, LESS, Vue SFCs, HTML, and JS/TS**, including Tailwind arbitrary values (`bg-[#3B82F6]`) and CSS-in-JS tagged templates (`styled`, `css`, `createGlobalStyle`).

The repository is public (MIT). You can clone or download it. Outside pull requests and commits are not accepted. Maintainer changes go through a feature-branch pull request.

## Install the extension

- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=bobrowsse-tech.design-token-extractor-migrator) — VS Code
- [Open VSX](https://open-vsx.org/extension/bobrowsse-tech.design-token-extractor-migrator) — Cursor, VSCodium
- Extension id: `bobrowsse-tech.design-token-extractor-migrator`

The [extension README](packages/vscode-extension/README.md) is the full how-to (commands, CodeLens, generated files, `.designtokenrc.json`). That same file is what the Marketplace listing shows.

## What it does now

| Area | What you get |
| --- | --- |
| Scan | Stylesheets plus Vue / HTML / JS-TS. Unknown properties contribute lengths and times only. Incremental rescan via `.designtokens-scan-cache.json`. Multi-root workspaces. |
| Name | Primitive names, selector-based semantic names (`color-background-card`), Tailwind / CSS named-color checks, `kebab` / `camel` / `pascal` / `snake`. |
| Review | **Review Clusters** to merge or keep near-matches. **Map Semantic Alias** to emit `--role: var(--primitive)`. Decisions persist on `tokens.lock.json`. |
| Rewrite | Exact values plus **assisted** unique literals in shorthand, `calc()`, media queries, and unique colors in multi-layer shadows. Preview is filterable by category. |
| Rename | Updates the lockfile **and** rewrites `var(--old)` / `$old` in source, then regenerates token files. |
| Undo | Last snapshot, or **Undo From History** for older `.designtokens-backup/` snapshots. |
| Contrast | Same-selector, ancestor, inherited, and document pairings. Semi-transparent colors are composited. |
| Themes | Light/dark pairing with configurable `theme.darkMarkers`. |

Close values are flagged as similar. They are **never auto-merged**. Ambiguous repeats, custom-property definitions, vendor prefixes, and assembled typography composites stay flagged for manual review.

## Typical extension workflow

Open a folder (or a multi-root workspace), then run from the Command Palette:

1. **Design Tokens: Scan Workspace** — report only (`.designtokens-report.json`)
2. **Design Tokens: Generate Token Files** — write `design-tokens/` (does not change source CSS)
3. **Design Tokens: Review Clusters** — merge or keep near-matches, and correct color names
4. **Design Tokens: Map Semantic Alias** — alias a primitive to a semantic role (optional)
5. **Design Tokens: Preview Migration** — accept or reject each safe / assisted replacement; filter by category
6. **Design Tokens: Apply Migration** — write only what you accepted
7. **Design Tokens: Undo Last Migration** / **Undo From History** — restore a local backup
8. **Design Tokens: Rename Token** — change a lockfile name, rewrite source references, regenerate files

After Scan or Generate, CodeLens titles include workspace occurrence counts. Clicking a lens still rewrites the current file only; workspace-wide writes go through Preview / Apply.

## CLI

```bash
npx @design-token-extractor/cli scan --dir ./my-project
npx @design-token-extractor/cli generate --dir ./my-project
npx @design-token-extractor/cli check --dir ./my-project
npx @design-token-extractor/cli preview --dir ./my-project --category color
npx @design-token-extractor/cli apply --dir ./my-project --yes
```

| Command | What it does |
| --- | --- |
| `scan` | Report hardcoded values. Writes nothing unless you redirect stdout. |
| `generate` | Write the token system (`design-tokens/` by default). Does not rewrite source. |
| `check` | Exit `1` if a new literal is not already in `tokens.lock.json`. |
| `preview` | Write `.designtokens-migration.json` (`--plan`, `--category`). Does not rewrite source. |
| `apply` | Apply accepted safe / assisted items from that plan. `--yes` is required. |

Packages:

| Package | Role |
| --- | --- |
| [`@design-token-extractor/core`](https://www.npmjs.com/package/@design-token-extractor/core) | Scan, cluster, name, generate, and rewrite logic |
| [`@design-token-extractor/cli`](https://www.npmjs.com/package/@design-token-extractor/cli) | `design-tokens scan`, `generate`, `check`, `preview`, and `apply` |
| `design-token-extractor-migrator` | VS Code / Cursor commands, CodeLens, Review Clusters, and the preview UI |

## Configuration

Copy `.designtokenrc.example.json` to `.designtokenrc.json` in the project you want to scan. You can set include/exclude globs, output directory, formats, naming case/prefix, theme dark markers, clustering thresholds, and categories.

In the editor, the same keys are under **Settings → Design Tokens**. Precedence: rc file > VS Code workspace settings > VS Code user settings > built-in defaults.

Default include: `**/*.{css,scss,sass,less,vue,html,htm,js,jsx,ts,tsx}` (skips `node_modules`, `dist`, `build`, `*.min.css`).

## Develop from this repo

Node.js 22 or later.

```bash
npm install
npm run build
npm test
npm run lint
```

Open this folder in VS Code and press `F5` to launch an Extension Development Host.

## License

MIT. See `LICENSE`.
