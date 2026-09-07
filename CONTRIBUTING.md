# Contributing

Thanks for helping. This is a small TypeScript monorepo:

- `packages/core` — extraction, clustering, naming, generators, rewriter
- `packages/cli` — `design-tokens scan|generate|check`
- `packages/vscode-extension` — commands, CodeLens, preview/apply UI

## Setup

Requires Node.js >= 22.

```bash
npm install
npm run build
npm test
npm run lint
npm run typecheck
```

## Pull requests

- Keep changes focused. Prefer a core-only change when the CLI and extension
  can share it.
- Add or update tests for extractor, rewriter, and config behavior.
- Do not commit secrets, `.env` files, AI-guidance notes, or private briefing
  documents (`docs/`, `START-HERE.md`, `AI-guidance/`).
- The rewrite path must stay AST-based (postcss). Do not add regex-over-file
  replacements for source CSS.
- Never auto-merge fuzzy color/spacing clusters. Flag them for approval.

## Commands that write files

- **Scan** writes only `.designtokens-report.json`.
- **Generate** writes token files and `tokens.lock.json`, not source CSS.
- **Apply Migration** writes source CSS only for occurrences the user accepted
  in Preview. That is the highest-risk path — treat it that way in review.
