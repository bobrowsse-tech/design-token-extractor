# Design Token Extractor & Migrator

Find hardcoded design values in CSS, SCSS, SASS, and LESS, turn them into a token system, and replace those literals with token references — after you preview and accept each change.

## What it does

- Scans a workspace for colors, spacing, type, radius, shadow, z-index, breakpoints, and transitions
- Clusters and names values, and keeps those names stable across rescans
- Generates CSS custom properties, SCSS variables, W3C DTCG JSON, and Tokens Studio JSON
- Flags weak color contrast and likely light/dark pairs
- Offers a per-occurrence preview before any source file is rewritten

## Commands

Open the Command Palette and run:

- **Design Tokens: Scan Workspace**
- **Design Tokens: Generate Token Files**
- **Design Tokens: Preview Migration**
- **Design Tokens: Apply Migration**
- **Design Tokens: Undo Migration**

Apply writes source files only for replacements you accepted. Shorthand values, `calc()`, custom-property definitions, vendor prefixes, and breakpoints are flagged for manual review.

## Configuration

Copy `.designtokenrc.example.json` from the [GitHub repository](https://github.com/bobrowsse-tech/design-token-extractor) into your project as `.designtokenrc.json` to set include/exclude globs, output directory, formats, and naming.

## License

MIT
