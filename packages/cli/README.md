# @design-token-extractor/cli

CLI for the [Design Token Extractor & Migrator](https://github.com/bobrowsse-tech/design-token-extractor). Same engine as the VS Code / Cursor extension. v0.3 includes `oklch()` / Color Module 4 parsing, DTCG 2025.10 output, and composite tokens.

```bash
npx @design-token-extractor/cli scan --dir ./my-project
npx @design-token-extractor/cli generate --dir ./my-project
npx @design-token-extractor/cli check --dir ./my-project
```

| Command | What it does |
| --- | --- |
| `scan` | Report hardcoded values. Writes nothing unless you redirect stdout. |
| `generate` | Write the token system (`design-tokens/` by default). Does not rewrite source CSS. |
| `check` | Exit `1` if a new literal is not already in `tokens.lock.json`. |

Optional config: `.designtokenrc.json` in `--dir`. See `.designtokenrc.example.json` in the [repository](https://github.com/bobrowsse-tech/design-token-extractor).

For the interactive preview / apply flow, use the [VS Code / Cursor extension](https://marketplace.visualstudio.com/items?itemName=bobrowsse-tech.design-token-extractor-migrator).

MIT

