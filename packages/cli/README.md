# @design-token-extractor/cli

Scan CSS, SCSS, SASS, and LESS for hardcoded design values, generate a token system, and check that new literals do not appear.

```bash
npx @design-token-extractor/cli scan --dir ./my-project
npx @design-token-extractor/cli generate --dir ./my-project
npx @design-token-extractor/cli check --dir ./my-project
```

`check` exits with status 1 when new hardcoded values are not in `tokens.lock.json`.

See the [repository](https://github.com/bobrowsse-tech/design-token-extractor) for configuration and the VS Code extension.

MIT
