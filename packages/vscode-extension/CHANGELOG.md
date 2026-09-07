# Changelog

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
