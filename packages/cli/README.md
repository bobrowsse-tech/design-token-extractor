# @design-token-extractor/cli

CLI for the [Design Token Extractor & Migrator](https://github.com/bobrowsse-tech/design-token-extractor). Same engine as the VS Code / Cursor extension.

```bash
npx @design-token-extractor/cli scan --dir ./my-project
npx @design-token-extractor/cli generate --dir ./my-project
npx @design-token-extractor/cli check --dir ./my-project
npx @design-token-extractor/cli preview --dir ./my-project --category color
npx @design-token-extractor/cli apply --dir ./my-project --yes
```

| Command | What it does |
| --- | --- |
| `scan` | Report hardcoded values. Writes nothing unless you redirect stdout. |
| `generate` | Write the token system (`design-tokens/` by default). Does not rewrite source CSS. |
| `check` | Exit `1` if a new literal is not already in `tokens.lock.json`. |
| `preview` | Write `.designtokens-migration.json` (optional `--plan`, `--category`). Does not rewrite source. |
| `apply` | Apply accepted safe/assisted items from that plan. `--yes` is required. |

Optional config: `.designtokenrc.json` in `--dir`. See `.designtokenrc.example.json` in the [repository](https://github.com/bobrowsse-tech/design-token-extractor).

The [VS Code / Cursor extension](https://marketplace.visualstudio.com/items?itemName=bobrowsse-tech.design-token-extractor-migrator) adds Review Clusters, Map Semantic Alias, CodeLens, and the preview webview.

MIT

