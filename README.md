# Design Token Extractor & Migrator

A VS Code / Cursor extension and CLI that finds hardcoded design values in CSS, SCSS, SASS, and LESS, turns them into a token system, and can replace those literals with token references — after you preview and accept each change.

The repository is public (MIT). You can clone or download it. Outside pull requests and commits are not accepted.

## Install the extension

- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=bobrowsse-tech.design-token-extractor-migrator) — VS Code
- [Open VSX](https://open-vsx.org/extension/bobrowsse-tech/design-token-extractor-migrator) — Cursor, VSCodium
- Extension id: `bobrowsse-tech.design-token-extractor-migrator`

How to use the commands, CodeLens, generated files, and `.designtokenrc.json` is in the [extension README](packages/vscode-extension/README.md). That same file is what the Marketplace listing shows.

## CLI

```bash
npx @design-token-extractor/cli scan --dir ./my-project
npx @design-token-extractor/cli generate --dir ./my-project
npx @design-token-extractor/cli check --dir ./my-project
```

`check` exits with status 1 when new hardcoded values appear that are not in `tokens.lock.json`.

Packages:

| Package | Role |
| --- | --- |
| [`@design-token-extractor/core`](https://www.npmjs.com/package/@design-token-extractor/core) | Scan, cluster, name, generate, and rewrite logic |
| [`@design-token-extractor/cli`](https://www.npmjs.com/package/@design-token-extractor/cli) | `design-tokens scan`, `generate`, and `check` |
| `design-token-extractor-migrator` | VS Code / Cursor commands, CodeLens, and the preview UI |

## Typical extension workflow

Open a folder that contains stylesheets, then run from the Command Palette:

1. **Design Tokens: Scan Workspace** — report only (`.designtokens-report.json`)
2. **Design Tokens: Generate Token Files** — write `design-tokens/` (does not change source CSS)
3. **Design Tokens: Preview Migration** — accept or reject each safe replacement
4. **Design Tokens: Apply Migration** — write only what you accepted
5. **Design Tokens: Undo Migration** — restore the last local backup

Apply never writes source files until you confirm. Shorthand values, `calc()`, custom-property definitions, vendor prefixes, and breakpoints are flagged for manual review. Close values can be flagged as similar; they are never auto-merged.

## Configuration

Copy `.designtokenrc.example.json` to `.designtokenrc.json` in the project you want to scan. You can set include/exclude globs, output directory, formats, naming prefix, clustering thresholds, and categories.

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
