# Phase 2 Implementation Status

This supplements `DIRECTIVE-design-token-extractor.md` (Phase 1) rather than
replacing it. It covers what was added in this session: most of the
brainstormed nice-to-haves, a monorepo restructure to support the CLI, and a
version-currency pass on every dependency.

## What's implemented

**Restructure**: `packages/core` (pure TS, zero UI deps) + `packages/cli` +
`packages/vscode-extension`, npm workspaces.

**Core pipeline** (`packages/core/src/pipeline.ts`), tying together:
- Clustering — exact-value (always safe) + fuzzy near-value (colors via a
  hand-rolled deltaE76, spacing via rem tolerance) — fuzzy matches are
  **flagged, never auto-merged**, per the original risk-avoidance directive.
- Spacing-scale detection (suggests a step size, e.g. 4px, never snaps
  automatically).
- Naming — hue/lightness-bucketed color names, pixel-based names for
  spacing/radius/etc., collision-safe (numeric suffix, ordered so the
  more-frequent value keeps the clean name).
- `tokens.lock.json` — deterministic ids (FNV-1a hash of category+value), so
  a rescan reuses existing names instead of shuffling them.
- Light/dark theme-pair detection (selector-marker heuristic).
- WCAG contrast checking (same-selector foreground/background pairs).
- Six generators: CSS custom properties, SCSS variables, W3C DTCG JSON,
  Tokens Studio JSON, a Stylelint config (using the real, existing
  `stylelint-declaration-strict-value` plugin), and a design-system README.
- A safe, AST-level, single-file rewriter that only touches unambiguous
  (non-shorthand) declarations — the CodeLens feature's backing logic.

**CLI** (`packages/cli`): `scan`, `generate`, and `check` (the CI
drift-prevention nice-to-have — exits 1 on new untracked hardcoded values).
Uses Node's built-in `util.parseArgs`, zero added dependency.

**VS Code extension**: the two Phase 1/2 commands plus a CodeLens provider
that surfaces "N other places in this file use this value" and offers a
scoped, safe replace.

**Tooling currency**: every dependency version in every `package.json` was
checked against the live npm registry during this session (documented in
chat) rather than assumed from training data. One deliberate exception:
TypeScript is pinned to 6.0.3 instead of the newer 7.0.2, because TS 7's
native compiler doesn't have a stable API yet and `typescript-eslint` hasn't
added support for it — see the root README for the full reasoning.

## What was actually validated vs. just written

Be precise about this distinction, since it matters for anyone picking this
up:

**Validated by running it** (originally via `tsx` without npm, then again
after a real `npm install`): `colorMath.ts`, `cluster.ts`,
`themePairing.ts`, `nameGenerator.ts`, `tokensLock.ts`, `contrastChecker.ts`,
all six generators, and the full `pipeline.ts` orchestration, run end-to-end
against fixture occurrence data. Unit tests for `colorMath`, `cluster`,
`nameGenerator`, `tokensLock`, `extractor`, and `simpleValueRewriter` now
pass under vitest (`38` tests).

**First-run with npm (2026-09-07):** `npm install`, `npm run build`,
`npm test`, `npm run lint`, and `npm run typecheck` all succeed. The real
PostCSS extractor against `demo/fixtures/sample.css` matches the
dependency-free demo's per-category shape (34 occurrences). The rewriter
replaces exact-value declarations (`#3B82F6` → `var(--color-blue-500)`) and
leaves shorthand / inexact matches alone.

A few compile/install issues had to be fixed before that was true:
`@eslint/js` was pinned to a nonexistent `10.10.0` (eslint itself is 10.10;
`@eslint/js` is `10.0.1`); `postcss.parse()` no longer accepts a `syntax`
option, so SCSS files now call `scss.parse()` directly; extractor context
now maps to `fullDeclarationValue`; core's tsconfig needed `"composite": true`
for the workspace project references.

**A real bug was caught this way**: `createLockFile` originally trusted
whatever `clusterId` the caller passed in, instead of deriving it itself. A
caller that didn't already run `assignIds()` first would silently write a
lockfile with wrong ids, and reconciliation on the next run would never
match — silently defeating the entire point of the lockfile. Fixed by having
`createLockFile` always (re-)derive ids itself. This is exactly the kind of
bug that's easy to miss when code is only read, not run.

**Previously unvalidated, now covered by tests:** `parser/extractor.ts` and
`rewriter/simpleValueRewriter.ts` — both need `postcss`, which is installed.
Treat the rewriter as still *narrow* (single-file, exact-value,
non-shorthand only), not as Phase 4 workspace-wide rewrite.

**Not run at all**: the GitHub Actions workflows (`ci.yml`, `release.yml`) —
written against documented GitHub Actions syntax but never executed, and the
action versions used are tags, not pinned SHAs (there's a comment flagging
this in both files, per the security document's own recommendation).

## Explicitly not done — real gaps, not just "future phases"

- **The CLI and core packages aren't actually publishable yet.** They
  reference each other via npm workspace linking
  (`"@design-tokens/core": "0.2.0"`), which works locally but hasn't been
  through an actual `npm publish` dry run. Before the CLI is usable outside
  this monorepo, that needs testing for real.
- **`.designtokenrc.json` loading is still a TODO** in the extension's
  `scanWorkspace` command (carried over from Phase 1, not addressed here).
- **Multi-root workspace support** is still just the first workspace folder.
- Framework adapters (CSS-in-JS, Vue SFC, Tailwind arbitrary values) — not
  started.
- Phase 3 (diff preview UI) and full Phase 4 (workspace-wide rewrite) are
  still not implemented — the CodeLens replace action is a deliberately
  narrow, single-file, non-shorthand-only preview of what Phase 4 will need
  to do much more carefully at full scale.
