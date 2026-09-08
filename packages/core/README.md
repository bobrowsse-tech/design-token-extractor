# @design-token-extractor/core

Scan, cluster, name, generate, and rewrite design tokens. Used by the [Design Token Extractor & Migrator](https://github.com/bobrowsse-tech/design-token-extractor) CLI and VS Code extension.

After v0.5 this package also reviews cluster decisions, maps semantic aliases, extracts Vue/HTML/JS and Tailwind arbitrary values, applies unique shorthand/`calc()` replacements, and incrementally rescans large trees.

```bash
npm install @design-token-extractor/core
```

Most people should use [`@design-token-extractor/cli`](https://www.npmjs.com/package/@design-token-extractor/cli) or the VS Code extension instead of importing this package directly.

MIT
