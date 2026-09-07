# Start Here

## What's in this folder

- **`build/`** — the actual project. Open this folder in VS Code tomorrow
  and start from here.
- **`docs/`** — everything else: the full technical directive, the
  publishing/security/cost guide, and the marketing materials.

## First commands to run tomorrow

```bash
cd build
npm install       # this is the first time these dependencies actually get
                   # installed — the sandbox this was built in had no
                   # network access, so nothing has been npm-installed yet
npm run build
npm test
npm run lint
```

If anything in `npm test` or `npm run lint` complains, that's expected and
useful — read `build/PHASE2-STATUS.md` first. It tells you exactly which
parts were validated by actually running the logic (most of it) versus
which parts still need real testing now that npm access exists
(`parser/extractor.ts` and `rewriter/simpleValueRewriter.ts` — both need
`postcss`, which couldn't be installed until now).

## Reading order

1. `build/README.md` — workspace layout, how to build, the TypeScript
   version decision.
2. `build/PHASE2-STATUS.md` — honest status: what's validated vs. not.
3. `docs/DIRECTIVE-design-token-extractor.md` — the full technical spec and
   build directive, Phases 1–5.
4. `docs/PUBLISHING-and-SECURITY.md` — when you're ready to publish: VS
   Code Marketplace + Open VSX, kept free and open-source, hardened against
   supply-chain attacks, all at $0 cost.
5. `docs/MARKETING-linkedin-and-video-ad.md` — launch post + AI video ad
   directive, for whenever you're ready to announce it.

## The immediate next real task

Once `npm install` succeeds, the highest-value thing to do first is run the
Phase 1 extractor for real against `build/packages/core/demo/fixtures/sample.css`
and confirm it produces the same shape of output as the dependency-free demo
already proved. Then do the same for the rewriter against a small test file
before trusting it near anything real.
