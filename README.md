# Design Token Extractor & Migrator

A VS Code extension and CLI that finds hardcoded design values in CSS, SCSS, SASS, and LESS, turns them into a token system, and can replace those literals with token references.

It will:

- Scan a project for colors, spacing, type, radius, shadow, z-index, breakpoints, and transitions
- Cluster and name values, then keep those names stable across rescans
- Generate tokens as CSS custom properties, SCSS variables, W3C DTCG JSON, and Tokens Studio JSON
- Flag weak color contrast and likely light/dark pairs
- Preview each replacement, apply only what you accept, and undo from a local backup

The repository is public (MIT). You can clone or download it. Outside pull requests and commits are not accepted.

## Packages

| Package | Role |
| --- | --- |
| `@design-tokens/core` | Scan, cluster, name, generate, and rewrite logic |
| `@design-tokens/cli` | `design-tokens scan`, `generate`, and `check` for local use or CI |
| `design-token-extractor-migrator` | VS Code commands, CodeLens, and the preview UI |

## Requirements

Node.js 22 or later.

```bash
npm install
npm run build
npm test
npm run lint
```

## VS Code extension

Open this folder in VS Code and press `F5` to launch an Extension Development Host. Open a project that contains CSS or SCSS, then use the Command Palette:

- **Design Tokens: Scan Workspace** — write a report of hardcoded values
- **Design Tokens: Generate Token Files** — write the token system (does not change your source CSS)
- **Design Tokens: Preview Migration** — accept or reject each safe replacement
- **Design Tokens: Apply Migration** — write only the replacements you accepted
- **Design Tokens: Undo Migration** — restore the last local backup

Apply never writes source files until you confirm the preview. Shorthand values, `calc()`, custom-property definitions, vendor prefixes, and breakpoints are flagged for manual review.

## CLI

```bash
npx @design-tokens/cli scan --dir ./my-project
npx @design-tokens/cli generate --dir ./my-project
npx @design-tokens/cli check --dir ./my-project
```

`check` exits with status 1 when new hardcoded values appear that are not in `tokens.lock.json`.

## Configuration

Copy `.designtokenrc.example.json` to `.designtokenrc.json` in the project you want to scan. You can set include/exclude globs, output directory, formats, naming prefix, clustering thresholds, and categories.

## License

MIT. See `LICENSE`.
