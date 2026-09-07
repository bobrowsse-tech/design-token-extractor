# Design Token Extractor & Migrator

Scans CSS/SCSS/SASS/LESS in a workspace, extracts hardcoded design values,
clusters and names them as tokens, generates a token system in several
formats, flags accessibility contrast issues, detects light/dark theme pairs,
and offers a safe in-file replace — as a VS Code extension, a standalone CLI
for CI, or both.

See `docs/DIRECTIVE-design-token-extractor.md` and `PHASE2-STATUS.md` for the
full design rationale, what's implemented vs. still open, and what was
actually validated versus just written.

## Workspace layout

```
packages/
  core/               @design-tokens/core — pure TypeScript, zero UI deps.
                       Extraction, clustering, naming, lockfile, a11y,
                       generators. Usable from both the CLI and the extension.
  cli/                @design-tokens/cli — `design-tokens scan|generate|check`,
                       for local use or CI/pre-commit hooks.
  vscode-extension/   The VS Code extension itself: commands + CodeLens.
```

## Building

Requires Node.js >=22 (this repo was built and version-pinned against the
Active LTS lines, 22 and 24, current as of when it was written).

```bash
npm install
npm run build
npm test
npm run lint
```

To try the extension: open this folder in VS Code, `F5` to launch an
Extension Development Host, open any folder with CSS/SCSS in it, then run
"Design Tokens: Scan Workspace" or "Design Tokens: Generate Token Files"
from the command palette.

To use the CLI standalone (e.g. in CI):
```bash
npx @design-tokens/cli generate --dir ./my-project
npx @design-tokens/cli check --dir ./my-project   # exits 1 on new untracked hardcoded values
```

## A note on TypeScript version

This targets TypeScript **6.0.3**, not the newer 7.0.2. TypeScript 7 is a
Go-native rewrite that's faster but doesn't have a stable programmatic API
yet, and `typescript-eslint` (used here for linting) hasn't added support for
it. Picking the highest version number would have broken the lint tooling on
day one — see `DIRECTIVE-design-token-extractor.md` for the version research
behind every other dependency choice too.

## License

MIT — see `LICENSE`. See `PUBLISHING-and-SECURITY.md` for how this is meant
to be published and kept free/open-source without costing anything or being
an easy target for supply-chain attacks.
