# Changelog

## Unreleased

- Native **Settings → Design Tokens** keys (`include`, `exclude`, `outputDir`, `naming.*`, `clustering.*`, `theme.darkMarkers`, `codeLens.enabled`) merge over core defaults; CodeLens toggles without a reload
- `.designtokenrc.json` now has JSON Schema validation and a tested precedence of rc > workspace settings > user settings > defaults
- **Design Tokens: Review Clusters** for fuzzy-match merge/keep-separate and reference-palette renames; decisions persist on `tokens.lock.json`
- Scan Vue / HTML / JS-TS, Tailwind arbitrary values, CSS-in-JS tagged templates, and LESS via `postcss-less`; extract lengths/times from unknown properties
- Multi-root workspaces, incremental `.designtokens-scan-cache.json`, configurable theme markers
- Semantic names, **Map Semantic Alias**, naming cases (`kebab` / `camel` / `pascal` / `snake`)
- **Rename Token** rewrites `var(--old)` / `$old` in source
- Assisted apply for unique shorthand / `calc()` / media values; Preview category filter; workspace CodeLens counts
- **Undo From History**; CLI `preview` and `apply --yes`
- Contrast pairs ancestor / inherited / document backgrounds and composites semi-transparent colors

## 0.4.0

- CodeLens replace now edits each declaration value in place (not a full-file swap), so Ctrl/Cmd+Z undoes just those replacements
- CodeLens replace snapshots the buffer after confirmation dialogs so edit ranges cannot go stale
- Apply undo copy points at **Undo Last Migration** only (Apply writes files on disk, not the editor undo stack)
- Replace treats `#3B82F6` / `#3b82f6` / `#FFF` / `#ffffff` as the same color when the whole declaration is that value
- Snapshot the file before replace/apply and restore it with **Design Tokens: Undo Last Migration**, including after the editor is closed
- Warn before rewrite when the folder is not a git repo or the file already has uncommitted changes
- Flag probable typos (rare near-duplicates next to a common or standard breakpoint / font-size / line-height) without merging them; same-selector media-query overrides are excluded
- Name colors from Tailwind / CSS named-color matches when they are perceptually close; **Rename Token** writes the new name through `tokens.lock.json`
- Skip `--custom-property` definitions during extract; treat quote/whitespace-only font-family differences as one cluster
- Contrast check adds a parent/child heuristic; theme pairs that match more than one candidate are marked low-confidence

## 0.3.0

- Parse CSS Color Module 4 colors (`oklch()`, `oklab()`, `lab()`, `lch()`, `hwb()`, modern `rgb()`/`hsl()`, `color(srgb …)` / `color(display-p3 …)`) so naming, clustering, and WCAG contrast work on them
- Emit W3C DTCG 2025.10 color objects (`colorSpace` + `components` + `alpha`), typed dimension/duration values, and `$extensions["design-token-extractor"].css`
- Extract composite shadow, border, transition, and typography tokens instead of splitting them into unrelated lengths and colors
- Emit typography as a CSS `font` shorthand and as structured objects in Tokens Studio / DTCG
- Add `opacity` tokens and treat `border-width` / `outline-width` / `flex-basis` as spacing

## 0.2.2

- Document the full extension workflow on the Marketplace and GitHub READMEs (install, scan, generate, preview, apply, undo, CodeLens, config, safety)

## 0.2.1

- First Marketplace listing as `bobrowsse-tech.design-token-extractor-migrator`
- Bundle the extension for publish from GitHub Releases

## 0.2.0

- Scan CSS, SCSS, SASS, and LESS for hardcoded design values
- Generate token files (CSS, SCSS, DTCG, Tokens Studio) and a lockfile
- Preview and apply safe, exact-value replacements
- Undo the last applied migration from a local backup
- Optional `.designtokenrc.json` for include/exclude, output, and naming
